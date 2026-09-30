package com.droneopsman.dominic.flightbridge

import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class LocalInspectionMediaServer(
    private val port: Int = 8788,
) {
    private val running = AtomicBoolean(false)
    private val files = ConcurrentHashMap<String, File>()
    private val executor = Executors.newCachedThreadPool()
    private var serverSocket: ServerSocket? = null

    fun start() {
        if (!running.compareAndSet(false, true)) return
        val socket = ServerSocket(port, 16, InetAddress.getLoopbackAddress())
        serverSocket = socket
        executor.execute {
            while (running.get()) {
                val client = runCatching { socket.accept() }.getOrNull() ?: continue
                executor.execute { handle(client) }
            }
        }
    }

    fun stop() {
        if (!running.compareAndSet(true, false)) return
        runCatching { serverSocket?.close() }
        serverSocket = null
        files.clear()
        executor.shutdownNow()
    }

    fun publish(file: File): String {
        require(file.exists() && file.isFile) { "Inspection media file does not exist." }
        val token = UUID.randomUUID().toString().replace("-", "")
        files[token] = file
        return "http://127.0.0.1:$port/media/$token"
    }

    private fun handle(client: Socket) {
        client.use { socket ->
            socket.soTimeout = 5_000
            val reader = socket.getInputStream().bufferedReader(StandardCharsets.US_ASCII)
            val requestLine = reader.readLine().orEmpty()
            val parts = requestLine.split(" ")
            if (parts.size < 2 || parts[0] != "GET") {
                respond(socket, 405, "text/plain", "Method Not Allowed".toByteArray())
                return
            }

            val rawPath = parts[1].substringBefore("?")
            val path = URLDecoder.decode(rawPath, StandardCharsets.UTF_8.name())
            val token = path.removePrefix("/media/")
            val file = if (path.startsWith("/media/")) files[token] else null
            if (file == null || !file.exists()) {
                respond(socket, 404, "text/plain", "Not Found".toByteArray())
                return
            }

            val contentType = when (file.extension.lowercase()) {
                "jpg", "jpeg" -> "image/jpeg"
                "png" -> "image/png"
                "tif", "tiff" -> "image/tiff"
                else -> "application/octet-stream"
            }
            val output = socket.getOutputStream()
            val header = buildString {
                append("HTTP/1.1 200 OK\r\n")
                append("Content-Type: $contentType\r\n")
                append("Content-Length: ${file.length()}\r\n")
                append("Cache-Control: no-store\r\n")
                append("Access-Control-Allow-Origin: *\r\n")
                append("Connection: close\r\n\r\n")
            }
            output.write(header.toByteArray(StandardCharsets.US_ASCII))
            file.inputStream().use { input -> input.copyTo(output) }
            output.flush()
        }
    }

    private fun respond(socket: Socket, status: Int, contentType: String, body: ByteArray) {
        val reason = when (status) {
            404 -> "Not Found"
            405 -> "Method Not Allowed"
            else -> "Error"
        }
        val output = socket.getOutputStream()
        val header = buildString {
            append("HTTP/1.1 $status $reason\r\n")
            append("Content-Type: $contentType\r\n")
            append("Content-Length: ${body.size}\r\n")
            append("Cache-Control: no-store\r\n")
            append("Access-Control-Allow-Origin: *\r\n")
            append("Connection: close\r\n\r\n")
        }
        output.write(header.toByteArray(StandardCharsets.US_ASCII))
        output.write(body)
        output.flush()
    }
}
