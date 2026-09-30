package com.droneopsman.dominic.flightbridge

import android.content.Context
import dji.sdk.keyvalue.key.CameraKey
import dji.sdk.keyvalue.key.KeyTools.createKey
import dji.sdk.keyvalue.value.camera.CameraMode
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.common.utils.RxUtil
import dji.v5.manager.datacenter.MediaDataCenter
import dji.v5.manager.datacenter.media.MediaFile
import dji.v5.manager.datacenter.media.MediaFileDownloadListener
import dji.v5.manager.datacenter.media.MediaFileListDataSource
import dji.v5.manager.datacenter.media.PullMediaFileListParam
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

data class DjiInspectionMediaCapture(
    val id: String,
    val aircraftId: String,
    val filename: String,
    val mimeType: String,
    val mediaUrl: String,
    val checkpointId: String?,
    val capturedAtMs: Long,
    val latitude: Double,
    val longitude: Double,
    val relativeAltitudeFt: Double,
    val headingDeg: Double,
    val gimbalPitchDeg: Double,
)

/**
 * Camera-only DJI inspection controller.
 *
 * This class can trigger a photo and retrieve the resulting media file. It has
 * no flight-controller commands and cannot arm, take off, navigate, RTH or land.
 */
class DjiInspectionCameraController(
    context: Context,
    private val telemetryProvider: MsdkTelemetryProvider,
    private val mediaServer: LocalInspectionMediaServer,
    private val cameraIndex: ComponentIndexType = ComponentIndexType.LEFT_OR_MAIN,
) {
    private val cacheDir = File(context.applicationContext.cacheDir, "dominic-inspection-media")
    private val scheduler = Executors.newSingleThreadScheduledExecutor()
    private val started = AtomicBoolean(false)

    fun start(onReady: (Boolean, String?) -> Unit = { _, _ -> }) {
        if (!started.compareAndSet(false, true)) return
        if (!cacheDir.exists()) cacheDir.mkdirs()

        val manager = MediaDataCenter.getInstance().mediaManager
        val source = MediaFileListDataSource.Builder().setIndexType(cameraIndex).build()
        manager.setMediaFileDataSource(source)
        manager.enable(object : CommonCallbacks.CompletionCallback {
            override fun onSuccess() = onReady(true, null)
            override fun onFailure(error: IDJIError) =
                onReady(false, error.toString())
        })
    }

    fun stop() {
        if (!started.compareAndSet(true, false)) return
        runCatching {
            MediaDataCenter.getInstance().mediaManager.disable(
                object : CommonCallbacks.CompletionCallback {
                    override fun onSuccess() = Unit
                    override fun onFailure(error: IDJIError) = Unit
                },
            )
        }
        scheduler.shutdownNow()
    }

    fun capturePhoto(
        captureId: String,
        checkpointId: String?,
        onAccepted: () -> Unit,
        onSuccess: (DjiInspectionMediaCapture) -> Unit,
        onFailure: (String) -> Unit,
    ) {
        if (!started.get()) {
            onFailure("DJI inspection camera is not initialized.")
            return
        }

        val manager = MediaDataCenter.getInstance().mediaManager
        val beforeIndex =
            manager.mediaFileListData?.data
                ?.maxOfOrNull { it.fileIndex }
                ?: -1

        RxUtil.setValue(
            createKey<CameraMode>(CameraKey.KeyCameraMode, cameraIndex),
            CameraMode.PHOTO_NORMAL,
        )
            .andThen(
                RxUtil.performActionWithOutResult(
                    createKey(CameraKey.KeyStartShootPhoto, cameraIndex),
                ),
            )
            .subscribe(
                {
                    onAccepted()
                    scheduler.schedule(
                        {
                            refreshAndDownloadLatest(
                                captureId = captureId,
                                checkpointId = checkpointId,
                                previousFileIndex = beforeIndex,
                                attemptsRemaining = 5,
                                onSuccess = onSuccess,
                                onFailure = onFailure,
                            )
                        },
                        900,
                        TimeUnit.MILLISECONDS,
                    )
                },
                { throwable -> onFailure(throwable.message ?: throwable.toString()) },
            )
    }

    private fun refreshAndDownloadLatest(
        captureId: String,
        checkpointId: String?,
        previousFileIndex: Int,
        attemptsRemaining: Int,
        onSuccess: (DjiInspectionMediaCapture) -> Unit,
        onFailure: (String) -> Unit,
    ) {
        val manager = MediaDataCenter.getInstance().mediaManager
        manager.pullMediaFileListFromCamera(
            PullMediaFileListParam.Builder()
                .mediaFileIndex(0)
                .count(30)
                .build(),
            object : CommonCallbacks.CompletionCallback {
                override fun onSuccess() {
                    val latest =
                        manager.mediaFileListData?.data
                            ?.maxByOrNull { it.fileIndex }

                    if (
                        latest == null ||
                        (previousFileIndex >= 0 && latest.fileIndex <= previousFileIndex)
                    ) {
                        if (attemptsRemaining <= 1) {
                            onFailure("DJI photo completed, but the new media file did not appear in the media list.")
                            return
                        }
                        scheduler.schedule(
                            {
                                refreshAndDownloadLatest(
                                    captureId,
                                    checkpointId,
                                    previousFileIndex,
                                    attemptsRemaining - 1,
                                    onSuccess,
                                    onFailure,
                                )
                            },
                            750,
                            TimeUnit.MILLISECONDS,
                        )
                        return
                    }

                    downloadMedia(
                        captureId = captureId,
                        checkpointId = checkpointId,
                        mediaFile = latest,
                        onSuccess = onSuccess,
                        onFailure = onFailure,
                    )
                }

                override fun onFailure(error: IDJIError) {
                    onFailure("DJI media list refresh failed: $error")
                }
            },
        )
    }

    private fun downloadMedia(
        captureId: String,
        checkpointId: String?,
        mediaFile: MediaFile,
        onSuccess: (DjiInspectionMediaCapture) -> Unit,
        onFailure: (String) -> Unit,
    ) {
        val safeName =
            mediaFile.fileName
                .replace(Regex("[^A-Za-z0-9._-]+"), "-")
                .take(120)
                .ifBlank { "capture-$captureId.jpg" }
        val outputFile = File(cacheDir, "$captureId-$safeName")
        val outputStream = FileOutputStream(outputFile, false)
        val buffered = BufferedOutputStream(outputStream)

        mediaFile.pullOriginalMediaFileFromCamera(
            0L,
            object : MediaFileDownloadListener {
                override fun onStart() = Unit
                override fun onProgress(total: Long, current: Long) = Unit

                override fun onRealtimeDataUpdate(data: ByteArray, position: Long) {
                    runCatching {
                        buffered.write(data)
                        buffered.flush()
                    }.onFailure {
                        onFailure("Unable to write DJI inspection media: ${it.message}")
                    }
                }

                override fun onFinish() {
                    runCatching { buffered.close() }
                    runCatching { outputStream.close() }

                    if (!outputFile.exists() || outputFile.length() == 0L) {
                        onFailure("DJI media download completed without image bytes.")
                        return
                    }

                    val snapshot = telemetryProvider.current()
                    val feetPerMeter = 3.280839895013123
                    val url = mediaServer.publish(outputFile)
                    val mimeType = when (outputFile.extension.lowercase()) {
                        "jpg", "jpeg" -> "image/jpeg"
                        "png" -> "image/png"
                        "tif", "tiff" -> "image/tiff"
                        else -> "application/octet-stream"
                    }

                    onSuccess(
                        DjiInspectionMediaCapture(
                            id = captureId,
                            aircraftId = snapshot.aircraftId,
                            filename = mediaFile.fileName,
                            mimeType = mimeType,
                            mediaUrl = url,
                            checkpointId = checkpointId,
                            capturedAtMs = System.currentTimeMillis(),
                            latitude = snapshot.latitude ?: 0.0,
                            longitude = snapshot.longitude ?: 0.0,
                            relativeAltitudeFt = (snapshot.altitudeM ?: 0.0) * feetPerMeter,
                            headingDeg = snapshot.headingDeg ?: 0.0,
                            gimbalPitchDeg = 0.0,
                        ),
                    )
                }

                override fun onFailure(error: IDJIError?) {
                    runCatching { buffered.close() }
                    runCatching { outputStream.close() }
                    runCatching { outputFile.delete() }
                    onFailure("DJI media download failed: $error")
                }
            },
        )
    }
}
