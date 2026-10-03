package com.droneopsman.dominic.flightbridge

import org.java_websocket.WebSocket
import org.java_websocket.drafts.Draft
import org.java_websocket.exceptions.InvalidDataException
import org.java_websocket.handshake.ServerHandshakeBuilder
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import java.net.InetAddress
import java.net.InetSocketAddress
import java.util.concurrent.ConcurrentHashMap

class InspectionLoopbackWebSocketServer(
    private val bridgeService: DominicInspectionBridgeService,
    port: Int = 8787,
) : WebSocketServer(InetSocketAddress(InetAddress.getLoopbackAddress(), port)) {
    private val clients = ConcurrentHashMap<WebSocket, DominicInspectionBridgeService.Client>()

    override fun onWebsocketHandshakeReceivedAsServer(conn: WebSocket, draft: Draft, request: ClientHandshake): ServerHandshakeBuilder {
        val origin = if (request.hasFieldValue("Origin")) request.getFieldValue("Origin") else null
        if (!isAllowedInspectionWebOrigin(origin)) throw InvalidDataException(1008, "Inspection bridge origin is not permitted")
        return super.onWebsocketHandshakeReceivedAsServer(conn, draft, request)
    }

    override fun onOpen(conn: WebSocket, handshake: ClientHandshake) {
        val client = SocketClient(conn)
        clients[conn] = client
        bridgeService.onClientConnected(client)
    }

    override fun onClose(conn: WebSocket, code: Int, reason: String, remote: Boolean) {
        clients.remove(conn)?.let(bridgeService::onClientClosed)
    }

    override fun onMessage(conn: WebSocket, message: String) {
        clients[conn]?.let { bridgeService.onClientText(it, message) }
    }

    override fun onError(conn: WebSocket?, ex: Exception) {
        if (conn != null) {
            clients.remove(conn)?.let(bridgeService::onClientClosed)
        }
    }

    override fun onStart() {
        connectionLostTimeout = 3
    }

    private class SocketClient(
        private val socket: WebSocket,
    ) : DominicInspectionBridgeService.Client {
        override val open: Boolean
            get() = socket.isOpen

        override val readyForPreview: Boolean
            get() = socket.isOpen && !socket.hasBufferedData()

        override fun send(text: String) {
            if (socket.isOpen) socket.send(text)
        }

        override fun close() {
            if (socket.isOpen) socket.close(1000, "DOMINIC DJI inspection bridge stopped")
        }
    }
}
