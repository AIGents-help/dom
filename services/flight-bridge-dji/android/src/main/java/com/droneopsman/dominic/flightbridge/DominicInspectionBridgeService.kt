package com.droneopsman.dominic.flightbridge

import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/**
 * DOMINIC DJI inspection bridge.
 *
 * Allowed:
 * - read telemetry
 * - trigger still-photo capture
 * - retrieve and expose captured media locally
 *
 * Explicitly rejected:
 * - arm/takeoff
 * - navigation/velocity/yaw flight control
 * - RTH/landing
 * - all other aircraft movement
 */
class DominicInspectionBridgeService(
    private val bridgeId: String,
    private val telemetryProvider: MsdkTelemetryProvider,
    private val cameraController: DjiInspectionCameraController,
) {
    interface Client {
        val open: Boolean
        fun send(text: String)
        fun close()
    }

    private val clients = CopyOnWriteArraySet<Client>()
    private val telemetrySequence = AtomicLong(0)
    private val mediaSequence = AtomicLong(0)
    private var heartbeatExecutor: ScheduledExecutorService? = null

    fun start() {
        telemetryProvider.start { snapshot ->
            broadcast(
                ReadOnlyProtocol.telemetry(
                    telemetrySequence.incrementAndGet(),
                    snapshot,
                ),
            )
        }

        cameraController.start()

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
        cameraController.stop()
        telemetryProvider.stop()
        clients.toList().forEach { it.close() }
        clients.clear()
    }

    fun onClientConnected(client: Client) {
        clients += client
        val snapshot = telemetryProvider.current()
        client.send(hello(snapshot))
        client.send(
            ReadOnlyProtocol.telemetry(
                telemetrySequence.incrementAndGet(),
                snapshot,
            ),
        )
    }

    fun onClientText(client: Client, raw: String) {
        val parsed = runCatching { JSONObject(raw) }.getOrElse {
            client.send(error("invalid_json", "Inbound Flight Bridge frame is not valid JSON."))
            return
        }

        if (parsed.optString("protocol") != ReadOnlyProtocol.PROTOCOL) {
            client.send(error("unsupported_protocol", "Unsupported Flight Bridge protocol."))
            return
        }
        if (parsed.optString("type") != "command") return

        val requestId = parsed.optString("requestId")
        val command = parsed.optJSONObject("command")
        val commandType = command?.optString("type").orEmpty()
        if (requestId.isBlank() || commandType.isBlank()) {
            client.send(
                error(
                    "invalid_command",
                    "Flight Bridge command is missing requestId or command.type.",
                    requestId.takeIf { it.isNotBlank() },
                ),
            )
            return
        }

        if (commandType == "setCameraSource") {
            val source = command?.optString("source").orEmpty()
            cameraController.setCameraSource(
                source = source,
                onSuccess = {
                    client.send(
                        commandResult(
                            requestId,
                            "setCameraSource",
                            accepted = true,
                            message = "DJI camera source set to $source.",
                        ),
                    )
                },
                onFailure = { message ->
                    client.send(error("camera_source_failed", message, requestId))
                },
            )
            return
        }

        if (commandType == "setFocusTarget") {
            val x = command?.optDouble("x", Double.NaN) ?: Double.NaN
            val y = command?.optDouble("y", Double.NaN) ?: Double.NaN
            cameraController.setFocusTarget(
                x = x,
                y = y,
                onSuccess = {
                    client.send(
                        commandResult(
                            requestId,
                            "setFocusTarget",
                            accepted = true,
                            message = "DJI autofocus target set.",
                        ),
                    )
                },
                onFailure = { message ->
                    client.send(error("camera_focus_failed", message, requestId))
                },
            )
            return
        }

        if (commandType == "setAELock") {
            val enabled = command?.optBoolean("enabled", true) ?: true
            cameraController.setAELock(
                enabled = enabled,
                onSuccess = {
                    client.send(
                        commandResult(
                            requestId,
                            "setAELock",
                            accepted = true,
                            message = if (enabled) "DJI auto exposure locked." else "DJI auto exposure unlocked.",
                        ),
                    )
                },
                onFailure = { message ->
                    client.send(error("camera_ae_lock_failed", message, requestId))
                },
            )
            return
        }

        if (commandType == "setZoom") {
            val ratio = command?.optDouble("ratio", Double.NaN) ?: Double.NaN
            cameraController.setZoomRatio(
                ratio = ratio,
                onSuccess = {
                    client.send(
                        commandResult(
                            requestId,
                            "setZoom",
                            accepted = true,
                            message = "DJI camera zoom set to ${"%.1f".format(ratio)}x.",
                        ),
                    )
                },
                onFailure = { message ->
                    client.send(error("camera_zoom_failed", message, requestId))
                },
            )
            return
        }

        if (commandType != "capturePhoto") {
            client.send(
                commandResult(
                    requestId,
                    commandType,
                    accepted = false,
                    message = "DJI inspection bridge allows camera-only commands; aircraft movement remains disabled.",
                ),
            )
            return
        }

        val checkpointId = command?.optString("checkpointId")?.takeIf { it.isNotBlank() }
        val evidenceRole = command?.optString("evidenceRole")?.takeIf {
            it in setOf("context", "detail", "quality_retry")
        }
        val evidenceSequenceId =
            command?.optString("evidenceSequenceId")?.takeIf { it.isNotBlank() }
        val captureId = "dji-${UUID.randomUUID()}"

        cameraController.capturePhoto(
            captureId = captureId,
            checkpointId = checkpointId,
            evidenceRole = evidenceRole,
            evidenceSequenceId = evidenceSequenceId,
            onAccepted = {
                client.send(
                    commandResult(
                        requestId,
                        "capturePhoto",
                        accepted = true,
                        message = "DJI shutter command accepted; media retrieval is in progress.",
                    ),
                )
            },
            onSuccess = { capture ->
                broadcast(mediaCapture(capture))
            },
            onFailure = { message ->
                client.send(
                    error(
                        "camera_capture_failed",
                        message,
                        requestId,
                    ),
                )
            },
        )
    }

    fun onClientClosed(client: Client) {
        clients -= client
    }

    private fun hello(snapshot: TelemetrySnapshot): String {
        val payloads = JSONArray().put(
            JSONObject()
                .put("id", "dji-main-rgb")
                .put("name", "DJI Main RGB Camera")
                .put("kind", "rgb")
                .put("supportsPhoto", true)
                .put("supportsVideo", false)
                .put("supportsGimbalPitch", false)
                .put("supportsGimbalYaw", false)
                .put("supportsZoom", true)
                .put("minZoom", 1.0)
                .put("maxZoom", 8.0),
        )

        return JSONObject()
            .put("type", "hello")
            .put("protocol", ReadOnlyProtocol.PROTOCOL)
            .put("bridgeId", bridgeId)
            .put("adapterVersion", "android-msdk-v5-inspection-camera")
            .put("vendor", "dji")
            .put("aircraftId", snapshot.aircraftId)
            .apply { snapshot.model?.let { put("model", it) } }
            .put(
                "capabilities",
                JSONObject()
                    .put("telemetry", true)
                    .put("arm", false)
                    .put("takeoff", false)
                    .put("goTo", false)
                    .put("velocityControl", false)
                    .put("yawControl", false)
                    .put("gimbalControl", false)
                    .put("photoCapture", true)
                    .put("cameraSourceControl", true)
                    .put("focusControl", true)
                    .put("aeLockControl", true)
                    .put("zoomControl", true)
                    .put("videoCapture", false)
                    .put("pauseResume", false)
                    .put("returnHome", false)
                    .put("land", false)
                    .put("obstacleSensing", false)
                    .put("rtk", false),
            )
            .put("payloads", payloads)
            .put("activePayloadId", "dji-main-rgb")
            .toString()
    }

    private fun mediaCapture(capture: DjiInspectionMediaCapture): String =
        JSONObject()
            .put("type", "media_capture")
            .put("protocol", ReadOnlyProtocol.PROTOCOL)
            .put("sequence", mediaSequence.incrementAndGet())
            .put(
                "capture",
                JSONObject()
                    .put("id", capture.id)
                    .put("aircraftId", capture.aircraftId)
                    .put("capturedAtMs", capture.capturedAtMs)
                    .put("mimeType", capture.mimeType)
                    .put("mediaUrl", capture.mediaUrl)
                    .put("filename", capture.filename)
                    .apply { capture.checkpointId?.let { put("checkpointId", it) } }
                    .apply { capture.evidenceRole?.let { put("evidenceRole", it) } }
                    .apply { capture.evidenceSequenceId?.let { put("evidenceSequenceId", it) } }
                    .put("latitude", capture.latitude)
                    .put("longitude", capture.longitude)
                    .put("relativeAltitudeFt", capture.relativeAltitudeFt)
                    .put("headingDeg", capture.headingDeg)
                    .put("gimbalPitchDeg", capture.gimbalPitchDeg)
                    .apply { capture.cameraSource?.let { put("cameraSource", it) } }
                    .apply { capture.zoomRatio?.let { put("zoomRatio", it) } }
                    .apply {
                        if (capture.focusTargetX != null && capture.focusTargetY != null) {
                            put(
                                "focusTarget",
                                JSONObject()
                                    .put("x", capture.focusTargetX)
                                    .put("y", capture.focusTargetY),
                            )
                        }
                    }
                    .apply { capture.aeLocked?.let { put("aeLocked", it) } },
            )
            .toString()

    private fun commandResult(
        requestId: String,
        command: String,
        accepted: Boolean,
        message: String,
    ): String =
        JSONObject()
            .put("type", "command_result")
            .put("protocol", ReadOnlyProtocol.PROTOCOL)
            .put("requestId", requestId)
            .put(
                "result",
                JSONObject()
                    .put("accepted", accepted)
                    .put("command", command)
                    .put("message", message),
            )
            .toString()

    private fun error(code: String, message: String, requestId: String? = null): String =
        JSONObject()
            .put("type", "error")
            .put("protocol", ReadOnlyProtocol.PROTOCOL)
            .put("code", code)
            .put("message", message)
            .apply { requestId?.let { put("requestId", it) } }
            .toString()

    private fun broadcast(frame: String) {
        clients.filter { it.open }.forEach { client ->
            runCatching { client.send(frame) }
        }
    }
}
