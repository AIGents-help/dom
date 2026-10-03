package com.droneopsman.dominic.flightbridge

import android.graphics.Bitmap
import android.util.Base64
import dji.sdk.keyvalue.key.CameraKey
import dji.sdk.keyvalue.key.KeyTools
import dji.sdk.keyvalue.value.camera.CameraVideoStreamSourceType
import dji.v5.manager.KeyManager
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.v5.manager.datacenter.MediaDataCenter
import dji.v5.manager.interfaces.ICameraStreamManager
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/** Read-only, bounded preview. No shutter, recording, or flight commands. */
class DjiCameraPreview(
    private val telemetryProvider: MsdkTelemetryProvider,
    private val hasViewers: () -> Boolean,
    private val publish: (String) -> Unit,
) {
    private val running = AtomicBoolean(false)
    private val busy = AtomicBoolean(false)
    private val sequence = AtomicLong(0)
    private val sessionId = UUID.randomUUID().toString()
    private var worker = Executors.newSingleThreadExecutor()
    @Volatile private var lastFrameAt = 0L
    private val listener = object : ICameraStreamManager.CameraFrameListener {
        override fun onFrame(data: ByteArray, offset: Int, length: Int, width: Int, height: Int, format: ICameraStreamManager.FrameFormat) {
            val now = System.currentTimeMillis()
            if (!running.get() || !hasViewers() || now - lastFrameAt < 500 ||
                format != ICameraStreamManager.FrameFormat.RGBA_8888 ||
                width !in 1..4096 || height !in 1..4096 || width.toLong() * height > 8_500_000 ||
                offset < 0 || length < width.toLong() * height * 4 || offset.toLong() + length > data.size ||
                !busy.compareAndSet(false, true)) return
            lastFrameAt = now
            val source = runCatching { KeyManager.getInstance().getValue(KeyTools.createKey(CameraKey.KeyCameraVideoStreamSource, ComponentIndexType.LEFT_OR_MAIN)) }.getOrNull()
            val cameraSource = when (source) {
                CameraVideoStreamSourceType.WIDE_CAMERA -> "wide"
                CameraVideoStreamSourceType.ZOOM_CAMERA -> "zoom"
                else -> { busy.set(false); return }
            }
            val snapshot = telemetryProvider.current()
            val pixels = data.copyOfRange(offset, offset + width * height * 4)
            try {
                worker.execute {
                    try {
                        if (!running.get()) return@execute
                        val original = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
                        val resized: Bitmap
                        try {
                            original.copyPixelsFromBuffer(ByteBuffer.wrap(pixels))
                            val scale = minOf(1.0, 960.0 / width, 960.0 / height)
                            resized = Bitmap.createScaledBitmap(original, maxOf(1, (width * scale).toInt()), maxOf(1, (height * scale).toInt()), true)
                        } catch (error: Exception) {
                            original.recycle()
                            throw error
                        }
                        try {
                            val bytes = ByteArrayOutputStream().use { out ->
                                resized.compress(Bitmap.CompressFormat.JPEG, 70, out)
                                out.toByteArray()
                            }
                            if (bytes.size > 300_000 || !running.get() || !hasViewers()) return@execute
                            val n = sequence.incrementAndGet()
                            val positionAvailable = snapshot.connected && now - snapshot.timestampMs in 0..3000 &&
                                snapshot.latitude != null && snapshot.longitude != null && snapshot.altitudeM != null && snapshot.headingDeg != null
                            val frame = JSONObject()
                                .put("width", resized.width).put("height", resized.height)
                                .put("jpegBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
                                .put("capture", JSONObject()
                                    .put("id", "preview-$sessionId-$n")
                                    .put("aircraftId", snapshot.aircraftId)
                                    .put("capturedAtMs", now).put("mimeType", "image/jpeg").put("cameraSource", cameraSource)
                                    .put("latitude", snapshot.latitude ?: 0.0).put("longitude", snapshot.longitude ?: 0.0)
                                    .put("relativeAltitudeFt", (snapshot.altitudeM ?: 0.0) * 3.280839895)
                                    .put("headingDeg", snapshot.headingDeg ?: 0.0).put("gimbalPitchDeg", 0.0)
                                    .put("previewFrame", JSONObject().put("width", resized.width).put("height", resized.height).put("telemetryAvailable", positionAvailable)))
                            publish(JSONObject().put("type", "camera_preview").put("protocol", ReadOnlyProtocol.PROTOCOL).put("sequence", n).put("frame", frame).toString())
                        } finally {
                            if (resized !== original) resized.recycle()
                            original.recycle()
                        }
                    } catch (_: Exception) {
                        // Drop a bad frame; the browser's freshness watchdog pauses inspection.
                    } finally {
                        busy.set(false)
                    }
                }
            } catch (_: java.util.concurrent.RejectedExecutionException) {
                busy.set(false)
            }
        }
    }

    fun start() {
        if (!running.compareAndSet(false, true)) return
        if (worker.isShutdown) worker = Executors.newSingleThreadExecutor()
        MediaDataCenter.getInstance().cameraStreamManager.addFrameListener(ComponentIndexType.LEFT_OR_MAIN, ICameraStreamManager.FrameFormat.RGBA_8888, listener)
    }

    fun stop() {
        running.set(false)
        MediaDataCenter.getInstance().cameraStreamManager.removeFrameListener(listener)
        worker.shutdownNow()
    }
}
