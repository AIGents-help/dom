package com.droneopsman.dominic.flightbridge

import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

class DominicReadOnlyBridgeService(
    private val bridgeId: String,
    private val telemetryProvider: MsdkTelemetryProvider,
    private val missionValidator: DominicDjiMissionValidator? = null,
) {
    interface Client {
        val open: Boolean
        fun send(text: String)
        fun close()
    }

    private val clients = CopyOnWriteArraySet<Client>()
    private val telemetrySequence = AtomicLong(0)
    private var heartbeatExecutor: ScheduledExecutorService? = null

    fun start() {
        telemetryProvider.start { snapshot ->
            val frame = ReadOnlyProtocol.telemetry(
                telemetrySequence.incrementAndGet(),
                snapshot,
            )
            broadcast(frame)
        }

        heartbeatExecutor = Executors.newSingleThreadScheduledExecutor().also { executor ->
            executor.scheduleAtFixedRate(
                { broadcast(ReadOnlyProtocol.heartbeat()) },
                1,
                1,
                TimeUnit.SECONDS,
            )
        }
    }

    fun stop() {
        heartbeatExecutor?.shutdownNow()
        heartbeatExecutor = null
        telemetryProvider.stop()
        clients.toList().forEach { it.close() }
        clients.clear()
    }

    fun onClientConnected(client: Client) {
        clients += client
        val snapshot = telemetryProvider.current()
        client.send(ReadOnlyProtocol.hello(bridgeId, snapshot))
        client.send(
            ReadOnlyProtocol.telemetry(
                telemetrySequence.incrementAndGet(),
                snapshot,
            ),
        )
    }

    fun onClientText(client: Client, text: String) {
        val parsed = runCatching { JSONObject(text) }.getOrNull()

        if (
            parsed?.optString("protocol") == ReadOnlyProtocol.PROTOCOL &&
            parsed.optString("type") == "mission_validate"
        ) {
            val requestId = parsed.optString("requestId")
            val mission = parsed.optJSONObject("mission")

            if (requestId.isBlank() || mission == null) {
                client.send(
                    ReadOnlyProtocol.error(
                        code = "invalid_mission_validation_request",
                        message = "Mission validation request is missing requestId or mission.",
                        requestId = requestId.takeIf { it.isNotBlank() },
                    ),
                )
                return
            }

            val validator = missionValidator
            if (validator == null) {
                client.send(
                    ReadOnlyProtocol.error(
                        code = "mission_validation_unavailable",
                        message = "DJI static mission validation is not available in this bridge host.",
                        requestId = requestId,
                    ),
                )
                return
            }

            val report = validator.validate(mission.toString())
            client.send(ReadOnlyProtocol.missionValidationResult(requestId, report))
            return
        }

        ReadOnlyProtocol.handleInbound(text)?.let(client::send)
    }

    fun onClientClosed(client: Client) {
        clients -= client
    }

    private fun broadcast(frame: String) {
        clients.filter { it.open }.forEach { client ->
            runCatching { client.send(frame) }
        }
    }
}
