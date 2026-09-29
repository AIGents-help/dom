package com.droneopsman.dominic.flightbridge

import org.json.JSONObject

object ReadOnlyProtocol {
    const val PROTOCOL = "dominic.flight-bridge.v1"

    fun hello(bridgeId: String, snapshot: TelemetrySnapshot): String =
        JSONObject()
            .put("type", "hello")
            .put("protocol", PROTOCOL)
            .put("bridgeId", bridgeId)
            .put("adapterVersion", "android-msdk-v5-readonly")
            .put("vendor", "dji")
            .put("aircraftId", snapshot.aircraftId)
            .put(
                "capabilities",
                JSONObject()
                    .put("telemetry", true)
                    .put("rtk", snapshot.rtkFixed != null)
                    .put("obstacleAvoidance", false)
                    .put("arm", false)
                    .put("takeoff", false)
                    .put("goTo", false)
                    .put("velocity", false)
                    .put("yaw", false)
                    .put("gimbal", false)
                    .put("photo", false)
                    .put("video", false)
                    .put("pauseResume", false)
                    .put("returnHome", false)
                    .put("land", false)
                    .put("abort", false),
            )
            .toString()

    fun telemetry(snapshot: TelemetrySnapshot): String =
        JSONObject()
            .put("type", "telemetry")
            .put("protocol", PROTOCOL)
            .put(
                "state",
                JSONObject()
                    .put("aircraftId", snapshot.aircraftId)
                    .put("connected", snapshot.connected)
                    .put("latitude", snapshot.latitude)
                    .put("longitude", snapshot.longitude)
                    .put("altitudeM", snapshot.altitudeM)
                    .put("headingDeg", snapshot.headingDeg)
                    .put("velocityNorthMps", snapshot.velocityNorthMps)
                    .put("velocityEastMps", snapshot.velocityEastMps)
                    .put("velocityDownMps", snapshot.velocityDownMps)
                    .put("batteryPercent", snapshot.batteryPercent)
                    .put("satelliteCount", snapshot.satelliteCount)
                    .put("rtkFixed", snapshot.rtkFixed)
                    .put("flightMode", snapshot.flightMode)
                    .put("timestampMs", snapshot.timestampMs),
            )
            .toString()

    fun rejectCommand(raw: String): String {
        val id = runCatching { JSONObject(raw).optString("id") }.getOrDefault("")
        return JSONObject()
            .put("type", "command_result")
            .put("protocol", PROTOCOL)
            .put("id", id)
            .put("ok", false)
            .put("error", "DJI Android bridge is in read-only telemetry mode")
            .toString()
    }
}
