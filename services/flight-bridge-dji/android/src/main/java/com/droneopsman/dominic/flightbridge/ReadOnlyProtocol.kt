package com.droneopsman.dominic.flightbridge

import org.json.JSONObject
import kotlin.math.hypot

object ReadOnlyProtocol {
    const val PROTOCOL = "dominic.flight-bridge.v1"
    private const val FEET_PER_METER = 3.280839895013123

    fun hello(bridgeId: String, snapshot: TelemetrySnapshot): String =
        JSONObject()
            .put("type", "hello")
            .put("protocol", PROTOCOL)
            .put("bridgeId", bridgeId)
            .put("adapterVersion", "android-msdk-v5-readonly")
            .put("vendor", "dji")
            .put("aircraftId", snapshot.aircraftId)
            .apply { snapshot.model?.let { put("model", it) } }
            .put(
                "capabilities",
                JSONObject()
                    .put("telemetry", true)
                    .put("arm", false)
                    .put("takeoff", false)
                    .put("goTo", false)
                    .put("velocityControl", false)
                    .put("yawControl", false)
                    .put("gimbalControl", false)
                    .put("photoCapture", false)
                    .put("videoCapture", false)
                    .put("pauseResume", false)
                    .put("returnHome", false)
                    .put("land", false)
                    .put("obstacleSensing", false)
                    .put("rtk", false),
            )
            .toString()

    fun telemetry(sequence: Long, snapshot: TelemetrySnapshot): String {
        val north = snapshot.velocityNorthMps
        val east = snapshot.velocityEastMps
        val down = snapshot.velocityDownMps

        val state = JSONObject()
            .put("aircraftId", snapshot.aircraftId)
            .put("vendor", "dji")
            .put("connected", snapshot.connected)
            .put("latitude", snapshot.latitude ?: 0.0)
            .put("longitude", snapshot.longitude ?: 0.0)
            .put("relativeAltitudeFt", (snapshot.altitudeM ?: 0.0) * FEET_PER_METER)
            .put("headingDeg", snapshot.headingDeg ?: 0.0)
            .put("gimbalPitchDeg", 0.0)
            .put("timestampMs", snapshot.timestampMs)

        snapshot.model?.let { state.put("model", it) }
        if (north != null && east != null) {
            state.put("groundSpeedFps", hypot(north, east) * FEET_PER_METER)
        }
        down?.let { state.put("verticalSpeedFps", -it * FEET_PER_METER) }
        snapshot.batteryPercent?.let { state.put("batteryPercent", it) }
        snapshot.satelliteCount?.let { state.put("satellites", it) }
        state.put("gnssQuality", "unknown")
        state.put("rtkState", "unsupported")
        snapshot.flightMode?.let { state.put("flightMode", it) }

        if (
            snapshot.laserTargetLatitude != null &&
            snapshot.laserTargetLongitude != null &&
            snapshot.laserUpdatedAtMs != null
        ) {
            val rangefinderTarget = JSONObject()
                .put("latitude", snapshot.laserTargetLatitude)
                .put("longitude", snapshot.laserTargetLongitude)
                .put("updatedAtMs", snapshot.laserUpdatedAtMs)

            snapshot.laserTargetAltitudeM?.let { rangefinderTarget.put("altitudeM", it) }
            snapshot.laserDistanceM?.let { rangefinderTarget.put("distanceM", it) }
            snapshot.laserScreenX?.let { rangefinderTarget.put("screenX", it) }
            snapshot.laserScreenY?.let { rangefinderTarget.put("screenY", it) }
            snapshot.laserMeasureState?.let { rangefinderTarget.put("status", it) }
            state.put("rangefinderTarget", rangefinderTarget)
        }

        return JSONObject()
            .put("type", "telemetry")
            .put("protocol", PROTOCOL)
            .put("sequence", sequence)
            .put("state", state)
            .toString()
    }

    fun heartbeat(): String =
        JSONObject()
            .put("type", "heartbeat")
            .put("protocol", PROTOCOL)
            .put("sentAtMs", System.currentTimeMillis())
            .toString()

    fun handleInbound(raw: String): String? {
        val parsed = runCatching { JSONObject(raw) }.getOrElse {
            return error("invalid_json", "Inbound Flight Bridge frame is not valid JSON.")
        }

        if (parsed.optString("protocol") != PROTOCOL) {
            return error("unsupported_protocol", "Unsupported Flight Bridge protocol.")
        }

        if (parsed.optString("type") != "command") {
            return null
        }

        val requestId = parsed.optString("requestId")
        val command = parsed.optJSONObject("command")
        val commandType = command?.optString("type").orEmpty()
        if (requestId.isBlank() || commandType.isBlank()) {
            return error(
                code = "invalid_command",
                message = "Flight Bridge command is missing requestId or command.type.",
                requestId = requestId.takeIf { it.isNotBlank() },
            )
        }

        return JSONObject()
            .put("type", "command_result")
            .put("protocol", PROTOCOL)
            .put("requestId", requestId)
            .put(
                "result",
                JSONObject()
                    .put("accepted", false)
                    .put("command", commandType)
                    .put("message", "DJI Android bridge is in read-only telemetry mode"),
            )
            .toString()
    }

    private fun error(code: String, message: String, requestId: String? = null): String =
        JSONObject()
            .put("type", "error")
            .put("protocol", PROTOCOL)
            .put("code", code)
            .put("message", message)
            .apply { requestId?.let { put("requestId", it) } }
            .toString()
}
