package com.droneopsman.dominic.flightbridge

/**
 * Transport-neutral Android host lifecycle.
 *
 * Bind a concrete loopback WebSocket implementation to [Client] in the Android app.
 * Keeping the socket dependency outside this class lets us use the controller-compatible
 * server library selected by the DJI sample project without changing DOMINIC protocol logic.
 */
class DominicReadOnlyBridgeService(
    private val bridgeId: String,
    private val telemetryProvider: MsdkTelemetryProvider,
) {
    interface Client {
        val open: Boolean
        fun send(text: String)
        fun close()
    }

    private val clients = linkedSetOf<Client>()

    fun start() {
        telemetryProvider.start { snapshot ->
            val frame = ReadOnlyProtocol.telemetry(snapshot)
            clients.filter { it.open }.forEach { it.send(frame) }
        }
    }

    fun stop() {
        telemetryProvider.stop()
        clients.toList().forEach { it.close() }
        clients.clear()
    }

    fun onClientConnected(client: Client) {
        clients += client
        client.send(ReadOnlyProtocol.hello(bridgeId, telemetryProvider.current()))
        client.send(ReadOnlyProtocol.telemetry(telemetryProvider.current()))
    }

    fun onClientText(client: Client, text: String) {
        // Stage 1 is deliberately incapable of commanding hardware.
        client.send(ReadOnlyProtocol.rejectCommand(text))
    }

    fun onClientClosed(client: Client) {
        clients -= client
    }
}
