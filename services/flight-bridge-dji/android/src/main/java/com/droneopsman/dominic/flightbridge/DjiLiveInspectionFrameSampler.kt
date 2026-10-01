package com.droneopsman.dominic.flightbridge

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.v5.manager.datacenter.MediaDataCenter
import dji.v5.manager.interfaces.ICameraStreamManager
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

data class DjiLiveInspectionFrame(
    val id: String,
    val aircraftId: String,
    val observedAtMs: Long,
    val mimeType: String,
    val frameUrl: String,
    val width: Int,
    val height: Int,
    val latitude: Double,
    val longitude: Double,
    val relativeAltitudeFt: Double,
    val headingDeg: Double,
    val gimbalPitchDeg: Double,
    val cameraSource: String?,
    val zoomRatio: Double?,
)

/**
 * Samples decoded DJI live-view frames without triggering the camera shutter.
 *
 * MSDK V5 CameraStreamManager delivers decoded frames through addFrameListener.
 * DOMINIC requests NV21 frames, throttles them, encodes selected frames as JPEG,
 * publishes them on the controller loopback media server, and forwards only the
 * sampled frame metadata to the browser bridge.
 *
 * This class exposes no aircraft movement authority.
 */
class DjiLiveInspectionFrameSampler(
    context: android.content.Context,
    private val telemetryProvider: MsdkTelemetryProvider,
    private val mediaServer: LocalInspectionMediaServer,
    private val cameraIndex: ComponentIndexType = ComponentIndexType.LEFT_OR_MAIN,
) {
    private val cacheDir = File(context.applicationContext.cacheDir, "dominic-live-inspection-frames")
    private val executor = Executors.newSingleThreadExecutor()
    private val active = AtomicBoolean(false)
    private val encoding = AtomicBoolean(false)
    private val lastPublishedAtMs = AtomicLong(0)

    @Volatile private var intervalMs: Long = 1_000
    @Volatile private var onFrame: ((DjiLiveInspectionFrame) -> Unit)? = null
    @Volatile var cameraSource: String? = null
    @Volatile var zoomRatio: Double? = null

    private val listener = object : ICameraStreamManager.CameraFrameListener {
        override fun onFrame(
            frameData: ByteArray,
            offset: Int,
            length: Int,
            width: Int,
            height: Int,
            format: ICameraStreamManager.FrameFormat,
        ) {
            if (!active.get()) return
            if (format != ICameraStreamManager.FrameFormat.NV21) return
            if (width <= 0 || height <= 0 || length <= 0) return

            val now = System.currentTimeMillis()
            val previous = lastPublishedAtMs.get()
            if (now - previous < intervalMs) return
            if (!lastPublishedAtMs.compareAndSet(previous, now)) return
            if (!encoding.compareAndSet(false, true)) return

            val safeOffset = offset.coerceAtLeast(0)
            val safeEnd = (safeOffset + length).coerceAtMost(frameData.size)
            if (safeOffset >= safeEnd) {
                encoding.set(false)
                return
            }
            val bytes = frameData.copyOfRange(safeOffset, safeEnd)

            executor.execute {
                try {
                    if (!cacheDir.exists()) cacheDir.mkdirs()
                    val frameId = "dji-frame-${UUID.randomUUID()}"
                    val file = File(cacheDir, "$frameId.jpg")
                    FileOutputStream(file, false).use { output ->
                        val image = YuvImage(bytes, ImageFormat.NV21, width, height, null)
                        if (!image.compressToJpeg(Rect(0, 0, width, height), 82, output)) {
                            throw IllegalStateException("Unable to encode DJI live frame as JPEG.")
                        }
                        output.flush()
                    }

                    val snapshot = telemetryProvider.current()
                    val feetPerMeter = 3.280839895013123
                    val frame = DjiLiveInspectionFrame(
                        id = frameId,
                        aircraftId = snapshot.aircraftId,
                        observedAtMs = now,
                        mimeType = "image/jpeg",
                        frameUrl = mediaServer.publish(file),
                        width = width,
                        height = height,
                        latitude = snapshot.latitude ?: 0.0,
                        longitude = snapshot.longitude ?: 0.0,
                        relativeAltitudeFt = (snapshot.altitudeM ?: 0.0) * feetPerMeter,
                        headingDeg = snapshot.headingDeg ?: 0.0,
                        gimbalPitchDeg = 0.0,
                        cameraSource = cameraSource,
                        zoomRatio = zoomRatio,
                    )
                    onFrame?.invoke(frame)
                    pruneCache()
                } catch (_: Exception) {
                    // The next decoded frame remains eligible after the throttle interval.
                } finally {
                    encoding.set(false)
                }
            }
        }
    }

    fun start(
        requestedIntervalMs: Long,
        onFrame: (DjiLiveInspectionFrame) -> Unit,
    ) {
        intervalMs = requestedIntervalMs.coerceIn(500, 10_000)
        this.onFrame = onFrame
        if (!active.compareAndSet(false, true)) return
        if (!cacheDir.exists()) cacheDir.mkdirs()
        lastPublishedAtMs.set(0)
        MediaDataCenter.getInstance().cameraStreamManager.addFrameListener(
            cameraIndex,
            ICameraStreamManager.FrameFormat.NV21,
            listener,
        )
    }

    fun updateInterval(requestedIntervalMs: Long) {
        intervalMs = requestedIntervalMs.coerceIn(500, 10_000)
    }

    fun stop() {
        if (!active.compareAndSet(true, false)) return
        MediaDataCenter.getInstance().cameraStreamManager.removeFrameListener(listener)
        onFrame = null
        encoding.set(false)
    }

    fun shutdown() {
        stop()
        executor.shutdownNow()
    }

    private fun pruneCache() {
        val files = cacheDir.listFiles()
            ?.filter { it.isFile }
            ?.sortedByDescending { it.lastModified() }
            ?: return
        files.drop(20).forEach { runCatching { it.delete() } }
    }
}
