package com.droneopsman.dominic.flightbridge

import android.content.Context

/**
 * Camera-enabled DOMINIC inspection runtime.
 *
 * The runtime keeps aircraft movement disabled. It only exposes telemetry and
 * still-photo capture/media retrieval through loopback services.
 */
class DjiInspectionBridgeRuntime(
    context: Context,
    bridgeId: String,
    telemetryProvider: MsdkTelemetryProvider = DjiKeyManagerTelemetryProvider(),
    websocketPort: Int = 8787,
    mediaPort: Int = 8788,
) {
    private val mediaServer = LocalInspectionMediaServer(mediaPort)
    private val cameraController = DjiInspectionCameraController(
        context = context,
        telemetryProvider = telemetryProvider,
        mediaServer = mediaServer,
    )
    private val liveFrameSampler = DjiLiveInspectionFrameSampler(
        context = context,
        telemetryProvider = telemetryProvider,
        mediaServer = mediaServer,
    )
    private val service = DominicInspectionBridgeService(
        bridgeId = bridgeId,
        telemetryProvider = telemetryProvider,
        cameraController = cameraController,
        liveFrameSampler = liveFrameSampler,
    )
    private val socketServer = InspectionLoopbackWebSocketServer(service, websocketPort)

    fun start() {
        mediaServer.start()
        service.start()
        socketServer.start()
    }

    fun stop() {
        runCatching { socketServer.stop(1_000) }
        service.stop()
        liveFrameSampler.shutdown()
        mediaServer.stop()
    }
}
