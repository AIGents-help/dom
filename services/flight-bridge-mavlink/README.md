# DOMINIC MAVLink Flight Bridge

Local bridge service for PX4, ArduPilot, and other MAVLink-compatible aircraft.

It connects to a MAVLink endpoint, normalizes aircraft telemetry into the DOMINIC
Flight Bridge v1 protocol, and translates DOMINIC universal commands into MAVLink.

## Run

```bash
cd services/flight-bridge-mavlink
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt

MAVLINK_CONNECTION=udpin:0.0.0.0:14550 \
DOMINIC_BRIDGE_HOST=127.0.0.1 \
DOMINIC_BRIDGE_PORT=8787 \
python bridge.py
```

Then connect DOMINIC Capture Planner to:

```
ws://127.0.0.1:8787
```

## Important configuration

- `MAVLINK_CONNECTION`: pymavlink connection string.
- `DOMINIC_BRIDGE_HOST`: WebSocket bind host. Defaults to loopback.
- `DOMINIC_BRIDGE_PORT`: WebSocket port. Defaults to 8787.
- `MAVLINK_COMMAND_TIMEOUT_SEC`: command acknowledgement timeout.
- `MAVLINK_ENABLE_GIMBAL`: advertise gimbal command support.
- `MAVLINK_ENABLE_CAMERA`: advertise still-image support.
- `MAVLINK_ENABLE_VIDEO`: advertise video support.
- `MAVLINK_ENABLE_PAUSE`: advertise pause/resume support.
- `OBSTACLE_ALERT_DISTANCE_M`: optional distance-sensor alert threshold; 0 disables it.
- `MAVLINK_MEDIA_URL_PREFIX`: optional HTTP(S) base URL used when `CAMERA_IMAGE_CAPTURED.file_url` is a local/file path. DOMINIC needs a browser-accessible media URL to automatically analyze image quality.

The bridge deliberately defaults optional payload capabilities to **off**. Enable them
only after confirming that the connected autopilot/payload exposes those MAVLink
services. DOMINIC capability negotiation will then adapt the mission accordingly.

## Safety

This bridge is an integration layer, not a replacement for pilot responsibility,
manufacturer limitations, local airspace rules, or aircraft-native failsafes. Test with
SITL/HITL before commanding a physical aircraft.


## Automatic photo ingestion

When the camera/autopilot emits `CAMERA_IMAGE_CAPTURED`, the bridge now publishes a
DOMINIC `media_capture` event containing the aircraft pose, gimbal state, image
identifier, optional checkpoint ID, and media reference.

If the MAVLink camera reports a direct `http://` or `https://` `file_url`, DOMINIC
uses it directly. If it reports a local path such as `file:///sdcard/DCIM/IMG_001.JPG`,
configure `MAVLINK_MEDIA_URL_PREFIX` to a small local HTTP server that exposes those
files, for example:

```bash
MAVLINK_MEDIA_URL_PREFIX=http://127.0.0.1:8788/media
```

DOMINIC will then automatically retrieve the image, measure sharpness/exposure/contrast,
update adaptive coverage, and generate a repair pass when a captured view is weak or
missing.
