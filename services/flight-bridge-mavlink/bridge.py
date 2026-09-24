from __future__ import annotations

import asyncio
import json
import math
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from pymavlink import mavutil
import websockets
from websockets.server import ServerConnection

PROTOCOL = "dominic.flight-bridge.v1"
FEET_PER_METER = 3.280839895013123
METERS_PER_FOOT = 1.0 / FEET_PER_METER


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class VehicleState:
    aircraftId: str = "mavlink-unknown"
    vendor: str = "mavlink"
    model: str = "MAVLink Vehicle"
    connected: bool = False
    latitude: float = 0.0
    longitude: float = 0.0
    relativeAltitudeFt: float = 0.0
    headingDeg: float = 0.0
    groundSpeedFps: float | None = None
    verticalSpeedFps: float | None = None
    batteryPercent: float | None = None
    satellites: int | None = None
    gnssQuality: str = "unknown"
    rtkState: str = "unsupported"
    gimbalPitchDeg: float = 0.0
    gimbalYawDeg: float | None = None
    cameraMode: str = "unknown"
    obstacleAlert: bool = False
    flightMode: str = "UNKNOWN"
    homeLatitude: float | None = None
    homeLongitude: float | None = None
    failsafe: str | None = None
    timestampMs: int = field(default_factory=lambda: int(time.time() * 1000))

    def as_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)


class MavlinkDriver:
    def __init__(self) -> None:
        self.connection_string = os.getenv(
            "MAVLINK_CONNECTION", "udpin:0.0.0.0:14550"
        )
        self.command_timeout = float(
            os.getenv("MAVLINK_COMMAND_TIMEOUT_SEC", "4")
        )
        self.obstacle_threshold_m = float(
            os.getenv("OBSTACLE_ALERT_DISTANCE_M", "0")
        )
        self.enable_gimbal = env_bool("MAVLINK_ENABLE_GIMBAL", False)
        self.enable_camera = env_bool("MAVLINK_ENABLE_CAMERA", False)
        self.enable_video = env_bool("MAVLINK_ENABLE_VIDEO", False)
        self.enable_pause = env_bool("MAVLINK_ENABLE_PAUSE", False)
        self.enable_rtk = env_bool("MAVLINK_ENABLE_RTK", False)
        self.enable_obstacle = self.obstacle_threshold_m > 0

        self.connection: Any | None = None
        self.state = VehicleState(
            rtkState="off" if self.enable_rtk else "unsupported"
        )
        self._running = False
        self._send_lock = threading.Lock()
        self._command_lock = asyncio.Lock()
        self._ack_waiters: dict[int, asyncio.Future[Any]] = {}
        self._state_callback: Callable[[dict[str, Any]], Awaitable[None]] | None = None
        self._media_callback: Callable[[dict[str, Any]], Awaitable[None]] | None = None
        self.media_url_prefix = os.getenv("MAVLINK_MEDIA_URL_PREFIX", "").rstrip("/")

    @property
    def capabilities(self) -> dict[str, bool]:
        return {
            "telemetry": True,
            "arm": True,
            "takeoff": True,
            "goTo": True,
            "velocityControl": True,
            "yawControl": True,
            "gimbalControl": self.enable_gimbal,
            "photoCapture": self.enable_camera,
            "videoCapture": self.enable_video,
            "pauseResume": self.enable_pause,
            "returnHome": True,
            "land": True,
            "obstacleSensing": self.enable_obstacle,
            "rtk": self.enable_rtk,
        }

    async def connect(self) -> None:
        self.connection = mavutil.mavlink_connection(self.connection_string)
        heartbeat = await asyncio.to_thread(
            self.connection.wait_heartbeat, timeout=15
        )
        if heartbeat is None:
            raise RuntimeError(
                f"No MAVLink heartbeat received on {self.connection_string}."
            )

        target_system = int(self.connection.target_system or heartbeat.get_srcSystem())
        target_component = int(
            self.connection.target_component or heartbeat.get_srcComponent()
        )
        self.connection.target_system = target_system
        self.connection.target_component = target_component

        self.state.aircraftId = f"mavlink-{target_system}"
        self.state.model = (
            f"MAVLink sys {target_system} / autopilot "
            f"{getattr(heartbeat, 'autopilot', 'unknown')}"
        )
        self.state.connected = True
        self.state.flightMode = mavutil.mode_string_v10(heartbeat) or "UNKNOWN"
        self.touch()

    async def run_reader(
        self,
        on_state: Callable[[dict[str, Any]], Awaitable[None]],
        on_media: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    ) -> None:
        if self.connection is None:
            raise RuntimeError("MAVLink driver is not connected.")

        self._state_callback = on_state
        self._media_callback = on_media
        self._running = True
        await self.publish_state()

        while self._running:
            message = await asyncio.to_thread(
                self.connection.recv_match, blocking=True, timeout=1
            )
            if message is None:
                continue
            self.handle_message(message)
            await self.publish_state()

    async def stop(self) -> None:
        self._running = False
        if self.connection is not None:
            try:
                self.connection.close()
            except Exception:
                pass
        self.connection = None
        self.state.connected = False
        self.touch()

    def handle_message(self, message: Any) -> None:
        message_type = message.get_type()
        if message_type == "BAD_DATA":
            return

        if message_type == "HEARTBEAT":
            self.state.connected = True
            self.state.flightMode = mavutil.mode_string_v10(message) or "UNKNOWN"

        elif message_type == "GLOBAL_POSITION_INT":
            self.state.latitude = float(message.lat) / 1e7
            self.state.longitude = float(message.lon) / 1e7
            self.state.relativeAltitudeFt = (
                float(message.relative_alt) / 1000.0 * FEET_PER_METER
            )
            if int(message.hdg) != 65535:
                self.state.headingDeg = float(message.hdg) / 100.0
            vx = float(message.vx) / 100.0
            vy = float(message.vy) / 100.0
            self.state.groundSpeedFps = math.hypot(vx, vy) * FEET_PER_METER
            self.state.verticalSpeedFps = (
                -float(message.vz) / 100.0 * FEET_PER_METER
            )

        elif message_type == "SYS_STATUS":
            remaining = int(message.battery_remaining)
            if remaining >= 0:
                self.state.batteryPercent = float(remaining)

        elif message_type == "GPS_RAW_INT":
            self.state.satellites = int(message.satellites_visible)
            fix_type = int(message.fix_type)
            if fix_type >= 6:
                self.state.gnssQuality = "excellent"
                self.state.rtkState = "fixed" if self.enable_rtk else "unsupported"
            elif fix_type == 5:
                self.state.gnssQuality = "excellent"
                self.state.rtkState = "float" if self.enable_rtk else "unsupported"
            elif fix_type >= 3:
                self.state.gnssQuality = "good"
                if self.enable_rtk:
                    self.state.rtkState = "off"
            elif fix_type == 2:
                self.state.gnssQuality = "fair"
                if self.enable_rtk:
                    self.state.rtkState = "off"
            else:
                self.state.gnssQuality = "poor"
                if self.enable_rtk:
                    self.state.rtkState = "off"

        elif message_type == "HOME_POSITION":
            self.state.homeLatitude = float(message.latitude) / 1e7
            self.state.homeLongitude = float(message.longitude) / 1e7

        elif message_type == "MOUNT_ORIENTATION":
            pitch = float(message.pitch)
            yaw = float(message.yaw)
            if math.isfinite(pitch):
                self.state.gimbalPitchDeg = pitch
            if math.isfinite(yaw):
                self.state.gimbalYawDeg = yaw

        elif message_type == "DISTANCE_SENSOR" and self.enable_obstacle:
            current_m = float(message.current_distance) / 100.0
            self.state.obstacleAlert = (
                current_m > 0 and current_m <= self.obstacle_threshold_m
            )

        elif message_type == "CAMERA_IMAGE_CAPTURED":
            media = self.media_from_camera_message(message)
            if media is not None and self._media_callback is not None:
                loop = asyncio.get_running_loop()
                loop.create_task(self._media_callback(media))

        elif message_type == "COMMAND_ACK":
            command_id = int(message.command)
            waiter = self._ack_waiters.pop(command_id, None)
            if waiter is not None and not waiter.done():
                waiter.set_result(message)

        self.touch()

    async def publish_state(self) -> None:
        if self._state_callback is not None:
            await self._state_callback(self.state.as_dict())

    def media_from_camera_message(self, message: Any) -> dict[str, Any] | None:
        result = int(getattr(message, "capture_result", 1))
        if result == 0:
            return None

        raw_url = getattr(message, "file_url", "")
        if isinstance(raw_url, (bytes, bytearray)):
            raw_url = raw_url.decode("utf-8", errors="ignore")
        raw_url = str(raw_url or "").split("\x00", 1)[0].strip()

        media_url: str | None = None
        if raw_url.startswith(("http://", "https://", "data:")):
            media_url = raw_url
        elif raw_url and self.media_url_prefix:
            filename = os.path.basename(raw_url.replace("file://", ""))
            if filename:
                media_url = f"{self.media_url_prefix}/{filename}"

        latitude = float(getattr(message, "lat", 0) or 0) / 1e7
        longitude_raw = getattr(message, "lon", getattr(message, "lng", 0))
        longitude = float(longitude_raw or 0) / 1e7
        if latitude == 0:
            latitude = self.state.latitude
        if longitude == 0:
            longitude = self.state.longitude

        relative_alt_m = getattr(message, "relative_alt", None)
        relative_altitude_ft = (
            float(relative_alt_m) / 1000.0 * FEET_PER_METER
            if relative_alt_m is not None
            else self.state.relativeAltitudeFt
        )

        image_index = int(getattr(message, "image_index", 0) or 0)
        filename = os.path.basename(raw_url.replace("file://", "")) if raw_url else None

        capture = {
            "id": f"mavlink-image-{image_index}-{int(time.time() * 1000)}",
            "aircraftId": self.state.aircraftId,
            "capturedAtMs": int(time.time() * 1000),
            "mimeType": "image/jpeg",
            "filename": filename,
            "latitude": latitude,
            "longitude": longitude,
            "relativeAltitudeFt": relative_altitude_ft,
            "headingDeg": self.state.headingDeg,
            "gimbalPitchDeg": self.state.gimbalPitchDeg,
            "gimbalYawDeg": self.state.gimbalYawDeg,
        }
        if media_url:
            capture["mediaUrl"] = media_url
        return capture

    def touch(self) -> None:
        self.state.timestampMs = int(time.time() * 1000)

    async def command_long(
        self,
        command_id: int,
        params: list[float] | None = None,
        require_ack: bool = True,
    ) -> None:
        if self.connection is None:
            raise RuntimeError("MAVLink connection is not available.")

        values = list(params or [])
        values.extend([0.0] * (7 - len(values)))
        values = values[:7]

        async with self._command_lock:
            loop = asyncio.get_running_loop()
            waiter: asyncio.Future[Any] | None = None
            if require_ack:
                waiter = loop.create_future()
                self._ack_waiters[command_id] = waiter

            with self._send_lock:
                self.connection.mav.command_long_send(
                    self.connection.target_system,
                    self.connection.target_component,
                    command_id,
                    0,
                    *values,
                )

            if waiter is None:
                return

            try:
                ack = await asyncio.wait_for(waiter, timeout=self.command_timeout)
            except asyncio.TimeoutError as exc:
                self._ack_waiters.pop(command_id, None)
                raise RuntimeError(
                    f"MAVLink command {command_id} was not acknowledged."
                ) from exc

            accepted = {
                mavutil.mavlink.MAV_RESULT_ACCEPTED,
                mavutil.mavlink.MAV_RESULT_IN_PROGRESS,
            }
            if int(ack.result) not in accepted:
                raise RuntimeError(
                    f"MAVLink command {command_id} rejected with result {ack.result}."
                )

    async def arm(self) -> None:
        await self.command_long(
            mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, [1.0]
        )

    async def takeoff(self, altitude_ft: float) -> None:
        await self.command_long(
            mavutil.mavlink.MAV_CMD_NAV_TAKEOFF,
            [0, 0, 0, math.nan, math.nan, math.nan, altitude_ft * METERS_PER_FOOT],
        )

    async def go_to(
        self,
        latitude: float,
        longitude: float,
        relative_altitude_ft: float,
        speed_fps: float | None,
    ) -> None:
        if self.connection is None:
            raise RuntimeError("MAVLink connection is not available.")

        if speed_fps is not None and speed_fps > 0:
            change_speed = getattr(
                mavutil.mavlink, "MAV_CMD_DO_CHANGE_SPEED", None
            )
            if change_speed is not None:
                await self.command_long(
                    int(change_speed),
                    [1.0, speed_fps * METERS_PER_FOOT, -1.0],
                )

        type_mask = 3576
        with self._send_lock:
            self.connection.mav.set_position_target_global_int_send(
                int(time.monotonic() * 1000) & 0xFFFFFFFF,
                self.connection.target_system,
                self.connection.target_component,
                mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
                type_mask,
                int(latitude * 1e7),
                int(longitude * 1e7),
                relative_altitude_ft * METERS_PER_FOOT,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
            )

    async def set_velocity(
        self, north_fps: float, east_fps: float, down_fps: float
    ) -> None:
        if self.connection is None:
            raise RuntimeError("MAVLink connection is not available.")

        type_mask = 3527
        with self._send_lock:
            self.connection.mav.set_position_target_local_ned_send(
                int(time.monotonic() * 1000) & 0xFFFFFFFF,
                self.connection.target_system,
                self.connection.target_component,
                mavutil.mavlink.MAV_FRAME_LOCAL_NED,
                type_mask,
                0,
                0,
                0,
                north_fps * METERS_PER_FOOT,
                east_fps * METERS_PER_FOOT,
                down_fps * METERS_PER_FOOT,
                0,
                0,
                0,
                0,
                0,
            )

    async def set_yaw(self, heading_deg: float) -> None:
        await self.command_long(
            mavutil.mavlink.MAV_CMD_CONDITION_YAW,
            [heading_deg % 360.0, 0, 1, 0],
        )

    async def set_gimbal(self, pitch_deg: float, yaw_deg: float | None) -> None:
        if not self.enable_gimbal:
            raise RuntimeError("Gimbal support is disabled for this bridge.")

        modern = getattr(
            mavutil.mavlink, "MAV_CMD_DO_GIMBAL_MANAGER_PITCHYAW", None
        )
        if modern is not None:
            await self.command_long(
                int(modern),
                [
                    pitch_deg,
                    yaw_deg if yaw_deg is not None else math.nan,
                    math.nan,
                    math.nan,
                    0,
                    0,
                    0,
                ],
            )
            return

        legacy = getattr(mavutil.mavlink, "MAV_CMD_DO_MOUNT_CONTROL", None)
        if legacy is None:
            raise RuntimeError("Connected pymavlink dialect has no gimbal command.")
        mount_mode = getattr(
            mavutil.mavlink, "MAV_MOUNT_MODE_MAVLINK_TARGETING", 2
        )
        await self.command_long(
            int(legacy),
            [pitch_deg, 0, yaw_deg or 0, 0, 0, 0, float(mount_mode)],
        )

    async def capture_photo(self) -> None:
        if not self.enable_camera:
            raise RuntimeError("Camera capture is disabled for this bridge.")
        await self.command_long(
            mavutil.mavlink.MAV_CMD_IMAGE_START_CAPTURE,
            [0, 0, 1, 0],
        )

    async def start_video(self) -> None:
        if not self.enable_video:
            raise RuntimeError("Video capture is disabled for this bridge.")
        command = getattr(mavutil.mavlink, "MAV_CMD_VIDEO_START_CAPTURE", None)
        if command is None:
            raise RuntimeError("Video start command is unavailable in this dialect.")
        await self.command_long(int(command), [0, 0, 0, 0, 0, 0, 0])

    async def stop_video(self) -> None:
        if not self.enable_video:
            raise RuntimeError("Video capture is disabled for this bridge.")
        command = getattr(mavutil.mavlink, "MAV_CMD_VIDEO_STOP_CAPTURE", None)
        if command is None:
            raise RuntimeError("Video stop command is unavailable in this dialect.")
        await self.command_long(int(command), [0, 0, 0, 0, 0, 0, 0])

    async def pause_or_resume(self, resume: bool) -> None:
        if not self.enable_pause:
            raise RuntimeError("Pause/resume is disabled for this bridge.")
        command = getattr(mavutil.mavlink, "MAV_CMD_DO_PAUSE_CONTINUE", None)
        if command is None:
            raise RuntimeError("Pause/resume command is unavailable in this dialect.")
        await self.command_long(int(command), [1.0 if resume else 0.0])

    async def return_to_launch(self) -> None:
        await self.command_long(mavutil.mavlink.MAV_CMD_NAV_RETURN_TO_LAUNCH)

    async def land(self) -> None:
        await self.command_long(mavutil.mavlink.MAV_CMD_NAV_LAND)

    async def abort(self, reason: str) -> None:
        self.state.failsafe = reason
        self.touch()
        await self.return_to_launch()


class DominicBridgeServer:
    def __init__(self, driver: MavlinkDriver) -> None:
        self.driver = driver
        self.host = os.getenv("DOMINIC_BRIDGE_HOST", "127.0.0.1")
        self.port = int(os.getenv("DOMINIC_BRIDGE_PORT", "8787"))
        self.bridge_id = os.getenv("DOMINIC_BRIDGE_ID", "mavlink-local")
        self.adapter_version = "1.0.0"
        self.clients: set[ServerConnection] = set()
        self.pending_checkpoint_ids: list[str] = []
        self.media_sequence = 0

    async def run(self) -> None:
        await self.driver.connect()
        reader_task = asyncio.create_task(self.driver.run_reader(self.broadcast_telemetry, self.broadcast_media))
        try:
            async with websockets.serve(self.handle_client, self.host, self.port):
                print(
                    f"DOMINIC MAVLink Flight Bridge listening on "
                    f"ws://{self.host}:{self.port} using {self.driver.connection_string}"
                )
                await asyncio.Future()
        finally:
            reader_task.cancel()
            await self.driver.stop()

    async def handle_client(self, websocket: ServerConnection) -> None:
        self.clients.add(websocket)
        try:
            await websocket.send(json.dumps(self.hello_message()))
            await websocket.send(json.dumps(self.telemetry_message()))
            heartbeat = asyncio.create_task(self.heartbeat_loop(websocket))
            try:
                async for raw in websocket:
                    await self.handle_client_message(websocket, raw)
            finally:
                heartbeat.cancel()
        finally:
            self.clients.discard(websocket)

    def hello_message(self) -> dict[str, Any]:
        return {
            "type": "hello",
            "protocol": PROTOCOL,
            "bridgeId": self.bridge_id,
            "vendor": "mavlink",
            "adapterVersion": self.adapter_version,
            "aircraftId": self.driver.state.aircraftId,
            "model": self.driver.state.model,
            "capabilities": self.driver.capabilities,
        }

    def telemetry_message(self) -> dict[str, Any]:
        sequence = int(time.monotonic() * 1000)
        return {
            "type": "telemetry",
            "protocol": PROTOCOL,
            "sequence": sequence,
            "state": self.driver.state.as_dict(),
        }

    async def broadcast_telemetry(self, state: dict[str, Any]) -> None:
        if not self.clients:
            return
        message = json.dumps(
            {
                "type": "telemetry",
                "protocol": PROTOCOL,
                "sequence": int(time.monotonic() * 1000),
                "state": state,
            }
        )
        stale: list[ServerConnection] = []
        for client in self.clients:
            try:
                await client.send(message)
            except Exception:
                stale.append(client)
        for client in stale:
            self.clients.discard(client)

    async def broadcast_media(self, capture: dict[str, Any]) -> None:
        if self.pending_checkpoint_ids and not capture.get("checkpointId"):
            capture["checkpointId"] = self.pending_checkpoint_ids.pop(0)

        if not self.clients:
            return

        self.media_sequence += 1
        message = json.dumps(
            {
                "type": "media_capture",
                "protocol": PROTOCOL,
                "sequence": self.media_sequence,
                "capture": capture,
            }
        )
        stale: list[ServerConnection] = []
        for client in self.clients:
            try:
                await client.send(message)
            except Exception:
                stale.append(client)
        for client in stale:
            self.clients.discard(client)

    async def heartbeat_loop(self, websocket: ServerConnection) -> None:
        while True:
            await asyncio.sleep(1)
            await websocket.send(
                json.dumps(
                    {
                        "type": "heartbeat",
                        "protocol": PROTOCOL,
                        "sentAtMs": int(time.time() * 1000),
                    }
                )
            )

    async def handle_client_message(
        self, websocket: ServerConnection, raw: str | bytes
    ) -> None:
        if not isinstance(raw, str):
            return
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            await self.send_error(websocket, "invalid_json", "Invalid JSON.")
            return

        if message.get("protocol") != PROTOCOL:
            await self.send_error(
                websocket, "invalid_protocol", "Unsupported DOMINIC bridge protocol."
            )
            return

        if message.get("type") != "command":
            return

        request_id = str(message.get("requestId") or "")
        command = message.get("command") or {}
        command_type = str(command.get("type") or "")

        queued_checkpoint_id = (
            str(command.get("checkpointId") or "")
            if command_type == "capturePhoto"
            else ""
        )
        if queued_checkpoint_id:
            self.pending_checkpoint_ids.append(queued_checkpoint_id)

        try:
            await self.execute_command(command_type, command)
            response = {
                "type": "command_result",
                "protocol": PROTOCOL,
                "requestId": request_id,
                "result": {
                    "accepted": True,
                    "command": command_type,
                },
            }
            await websocket.send(json.dumps(response))
        except Exception as exc:
            if queued_checkpoint_id:
                try:
                    self.pending_checkpoint_ids.remove(queued_checkpoint_id)
                except ValueError:
                    pass
            response = {
                "type": "command_result",
                "protocol": PROTOCOL,
                "requestId": request_id,
                "result": {
                    "accepted": False,
                    "command": command_type,
                    "message": str(exc),
                },
            }
            await websocket.send(json.dumps(response))

    async def execute_command(
        self, command_type: str, command: dict[str, Any]
    ) -> None:
        if command_type == "arm":
            await self.driver.arm()
        elif command_type == "takeoff":
            await self.driver.takeoff(float(command["altitudeFt"]))
        elif command_type == "goTo":
            await self.driver.go_to(
                float(command["latitude"]),
                float(command["longitude"]),
                float(command["relativeAltitudeFt"]),
                float(command["speedFps"]) if command.get("speedFps") is not None else None,
            )
        elif command_type == "setVelocity":
            await self.driver.set_velocity(
                float(command["northFps"]),
                float(command["eastFps"]),
                float(command["downFps"]),
            )
        elif command_type == "setYaw":
            await self.driver.set_yaw(float(command["headingDeg"]))
        elif command_type == "setGimbal":
            await self.driver.set_gimbal(
                float(command["pitchDeg"]),
                float(command["yawDeg"]) if command.get("yawDeg") is not None else None,
            )
        elif command_type == "capturePhoto":
            await self.driver.capture_photo()
        elif command_type == "startVideo":
            await self.driver.start_video()
        elif command_type == "stopVideo":
            await self.driver.stop_video()
        elif command_type == "pause":
            await self.driver.pause_or_resume(False)
        elif command_type == "resume":
            await self.driver.pause_or_resume(True)
        elif command_type == "returnHome":
            await self.driver.return_to_launch()
        elif command_type == "land":
            await self.driver.land()
        elif command_type == "abort":
            await self.driver.abort(str(command.get("reason") or "DOMINIC abort"))
        else:
            raise RuntimeError(f"Unsupported DOMINIC command: {command_type}")

    async def send_error(
        self,
        websocket: ServerConnection,
        code: str,
        message: str,
        request_id: str | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "type": "error",
            "protocol": PROTOCOL,
            "code": code,
            "message": message,
        }
        if request_id:
            payload["requestId"] = request_id
        await websocket.send(json.dumps(payload))


async def main() -> None:
    server = DominicBridgeServer(MavlinkDriver())
    await server.run()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
