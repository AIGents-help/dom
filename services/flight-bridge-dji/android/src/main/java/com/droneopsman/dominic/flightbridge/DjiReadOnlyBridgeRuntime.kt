package com.droneopsman.dominic.flightbridge

/**
 * Small lifecycle facade for embedding the DOMINIC bridge in the DJI controller app.
 *
 * SDK registration/activation remains owned by the Android application. Start this
 * runtime only after DJI MSDK has initialized.
 */
class DjiReadOnlyBridgeRuntime(
    bridgeId: String,
    telemetryProvider: MsdkTelemetryProvider = DjiKeyManagerTelemetryProvider(),
    port: Int = 8787,
) {
    private val service = DominicReadOnlyBridgeService(bridgeId, telemetryProvider)
    private val socketServer = LoopbackWebSocketServer(service, port)

    fun start() {
        service.start()
        socketServer.start()
    }

    fun stop() {
        runCatching { socketServer.stop(1_000) }
        service.stop()
    }
}
