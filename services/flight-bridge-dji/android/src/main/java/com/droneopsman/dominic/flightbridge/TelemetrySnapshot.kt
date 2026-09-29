package com.droneopsman.dominic.flightbridge

data class TelemetrySnapshot(
    val aircraftId: String,
    val model: String? = null,
    val connected: Boolean,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val altitudeM: Double? = null,
    val headingDeg: Double? = null,
    val velocityNorthMps: Double? = null,
    val velocityEastMps: Double? = null,
    val velocityDownMps: Double? = null,
    val batteryPercent: Int? = null,
    val satelliteCount: Int? = null,
    val flightMode: String? = null,
    val timestampMs: Long = System.currentTimeMillis(),
)

interface MsdkTelemetryProvider {
    fun current(): TelemetrySnapshot
    fun start(onTelemetry: (TelemetrySnapshot) -> Unit)
    fun stop()
}
