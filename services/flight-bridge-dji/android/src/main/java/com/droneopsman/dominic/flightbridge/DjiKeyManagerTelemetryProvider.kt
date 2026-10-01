package com.droneopsman.dominic.flightbridge

import dji.sdk.keyvalue.key.BatteryKey
import dji.sdk.keyvalue.key.CameraKey
import dji.sdk.keyvalue.key.FlightControllerKey
import dji.sdk.keyvalue.key.KeyTools
import dji.sdk.keyvalue.key.ProductKey
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.sdk.keyvalue.value.common.LocationCoordinate2D
import dji.sdk.keyvalue.value.common.Velocity3D
import dji.sdk.keyvalue.value.product.ProductType
import dji.v5.manager.KeyManager
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Read-only DJI Mobile SDK V5 telemetry source.
 *
 * No DJI action/set API is referenced here. The provider only subscribes to/get values
 * exposed by KeyManager and translates them into the transport-neutral DOMINIC snapshot.
 */
class DjiKeyManagerTelemetryProvider : MsdkTelemetryProvider {
    private val running = AtomicBoolean(false)
    @Volatile
    private var listener: ((TelemetrySnapshot) -> Unit)? = null

    @Volatile
    private var snapshot = TelemetrySnapshot(
        aircraftId = "dji-unidentified",
        model = null,
        connected = false,
    )

    private val connectionKey = KeyTools.createKey(FlightControllerKey.KeyConnection)
    private val serialNumberKey = KeyTools.createKey(FlightControllerKey.KeySerialNumber)
    private val productTypeKey = KeyTools.createKey(ProductKey.KeyProductType)
    private val locationKey = KeyTools.createKey(FlightControllerKey.KeyAircraftLocation)
    private val altitudeKey = KeyTools.createKey(FlightControllerKey.KeyAltitude)
    private val headingKey = KeyTools.createKey(FlightControllerKey.KeyCompassHeading)
    private val velocityKey = KeyTools.createKey(FlightControllerKey.KeyAircraftVelocity)
    private val satelliteKey = KeyTools.createKey(FlightControllerKey.KeyGPSSatelliteCount)
    private val flightModeKey = KeyTools.createKey(FlightControllerKey.KeyFlightMode)
    private val laserMeasureInformationKey = KeyTools.createKey(
        CameraKey.KeyLaserMeasureInformation,
        ComponentIndexType.LEFT_OR_MAIN,
    )
    private val batteryPercentKey = KeyTools.createKey(
        BatteryKey.KeyChargeRemainingInPercent,
        ComponentIndexType.AGGREGATION,
    )

    override fun current(): TelemetrySnapshot = snapshot.copy()

    override fun start(onTelemetry: (TelemetrySnapshot) -> Unit) {
        if (!running.compareAndSet(false, true)) return
        listener = onTelemetry

        refreshInitialValues()
        attachListeners()
        emit()
    }

    override fun stop() {
        if (!running.compareAndSet(true, false)) return
        KeyManager.getInstance().cancelListen(this)
        listener = null
    }

    private fun refreshInitialValues() {
        val manager = KeyManager.getInstance()
        val connected = manager.getValue(connectionKey, false)
        val serial = manager.getValue(serialNumberKey, "")
        val productType = manager.getValue(productTypeKey, ProductType.UNKNOWN)
        val location = manager.getValue(locationKey, LocationCoordinate2D(0.0, 0.0))
        val altitude = manager.getValue(altitudeKey, 0.0)
        val heading = manager.getValue(headingKey, 0.0)
        val satellites = manager.getValue(satelliteKey, 0)
        val battery = manager.getValue(batteryPercentKey, 0)
        val laser = manager.getValue(laserMeasureInformationKey, null)

        snapshot = snapshot.copy(
            aircraftId = serial.takeIf { it.isNotBlank() } ?: "dji-unidentified",
            model = productType.toString(),
            connected = connected,
            latitude = location.latitude,
            longitude = location.longitude,
            altitudeM = altitude,
            headingDeg = heading,
            batteryPercent = battery,
            satelliteCount = satellites,
            laserTargetLatitude = laser?.location3D?.latitude,
            laserTargetLongitude = laser?.location3D?.longitude,
            laserTargetAltitudeM = laser?.location3D?.altitude,
            laserDistanceM = laser?.distance,
            laserScreenX = laser?.targetPoint?.x,
            laserScreenY = laser?.targetPoint?.y,
            laserMeasureState = laser?.laserMeasureState?.toString(),
            laserUpdatedAtMs = laser?.let { System.currentTimeMillis() },
            timestampMs = System.currentTimeMillis(),
        )
    }

    private fun attachListeners() {
        val manager = KeyManager.getInstance()

        manager.listen(connectionKey, this) { _, value ->
            update { it.copy(connected = value == true) }
        }
        manager.listen(serialNumberKey, this) { _, value ->
            update {
                it.copy(
                    aircraftId = value?.takeIf(String::isNotBlank) ?: it.aircraftId,
                )
            }
        }
        manager.listen(productTypeKey, this) { _, value ->
            update { it.copy(model = value?.toString() ?: it.model) }
        }
        manager.listen(locationKey, this) { _, value ->
            if (value != null) {
                update {
                    it.copy(
                        latitude = value.latitude,
                        longitude = value.longitude,
                    )
                }
            }
        }
        manager.listen(altitudeKey, this) { _, value ->
            value?.let { altitude -> update { it.copy(altitudeM = altitude) } }
        }
        manager.listen(headingKey, this) { _, value ->
            value?.let { heading -> update { it.copy(headingDeg = heading) } }
        }
        manager.listen(velocityKey, this) { _, value ->
            value?.let(::updateVelocity)
        }
        manager.listen(satelliteKey, this) { _, value ->
            value?.let { satellites -> update { it.copy(satelliteCount = satellites) } }
        }
        manager.listen(flightModeKey, this) { _, value ->
            update { it.copy(flightMode = value?.toString() ?: it.flightMode) }
        }
        manager.listen(batteryPercentKey, this) { _, value ->
            value?.let { battery -> update { it.copy(batteryPercent = battery) } }
        }
        manager.listen(laserMeasureInformationKey, this) { _, value ->
            if (value == null) {
                update {
                    it.copy(
                        laserTargetLatitude = null,
                        laserTargetLongitude = null,
                        laserTargetAltitudeM = null,
                        laserDistanceM = null,
                        laserScreenX = null,
                        laserScreenY = null,
                        laserMeasureState = null,
                        laserUpdatedAtMs = null,
                    )
                }
            } else {
                val location = value.location3D
                val screen = value.targetPoint
                update {
                    it.copy(
                        laserTargetLatitude = location.latitude,
                        laserTargetLongitude = location.longitude,
                        laserTargetAltitudeM = location.altitude,
                        laserDistanceM = value.distance,
                        laserScreenX = screen.x,
                        laserScreenY = screen.y,
                        laserMeasureState = value.laserMeasureState.toString(),
                        laserUpdatedAtMs = System.currentTimeMillis(),
                    )
                }
            }
        }
    }

    private fun updateVelocity(value: Velocity3D) {
        update {
            it.copy(
                velocityNorthMps = value.x,
                velocityEastMps = value.y,
                velocityDownMps = value.z,
            )
        }
    }

    private inline fun update(transform: (TelemetrySnapshot) -> TelemetrySnapshot) {
        snapshot = transform(snapshot).copy(timestampMs = System.currentTimeMillis())
        emit()
    }

    private fun emit() {
        if (running.get()) listener?.invoke(current())
    }
}
