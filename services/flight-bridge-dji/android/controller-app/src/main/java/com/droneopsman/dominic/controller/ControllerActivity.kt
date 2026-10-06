package com.droneopsman.dominic.controller

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import com.droneopsman.dominic.flightbridge.DjiMsdkInspectionHost
import org.java_websocket.client.WebSocketClient
import org.java_websocket.handshake.ServerHandshake
import org.json.JSONObject
import java.net.URI

/** Foreground bench host. The native bridge stays in this activity while DOMINIC is open. */
class ControllerActivity : Activity() {
    private var host: DjiMsdkInspectionHost? = null
    private var probe: WebSocketClient? = null
    private var destroyed = false
    private lateinit var status: TextView
    private lateinit var bench: TextView
    private lateinit var start: Button
    private lateinit var stop: Button
    private lateinit var check: Button
    private lateinit var open: Button
    private lateinit var web: WebView
    private var telemetryFrames = 0
    private var previewFrames = 0
    private var aircraftConnected = false
    private var lastTelemetryAt = 0L
    private var lastPreviewAt = 0L
    private val handler = Handler(Looper.getMainLooper())
    private val refreshFeed = object : Runnable {
        override fun run() {
            if (destroyed) return
            if (probe?.isOpen == true && telemetryFrames > 0) {
                val now = System.currentTimeMillis()
                val connected = aircraftConnected && now - lastTelemetryAt <= 5_000
                val preview = if (lastPreviewAt > 0 && now - lastPreviewAt <= 5_000) "current" else "waiting / stale"
                bench.text = "Aircraft: ${if (connected) "connected" else "disconnected / stale"} · telemetry: $telemetryFrames · preview: $preview ($previewFrames frames). Transport check only."
            }
            handler.postDelayed(this, 1_000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(16, 16, 16, 16)
            setBackgroundColor(Color.rgb(30, 36, 43))
            fitsSystemWindows = true
        }
        fun text(value: String) = TextView(this).apply {
            text = value
            setTextColor(Color.WHITE)
            setPadding(0, 4, 0, 4)
        }
        root.addView(text("DOMINIC Controller · inspection bench"))
        status = text("Ready to initialize DJI SDK.")
        bench = text("No hardware connection verified. Keep the aircraft grounded for this bench test.")
        root.addView(status)
        root.addView(bench)
        val buttons = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        fun button(label: String, action: () -> Unit) = Button(this).apply {
            text = label
            setOnClickListener { action() }
            buttons.addView(this, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        }
        start = button("Start bridge") { requestAndStart() }
        stop = button("Stop") { stopBridge() }.apply { isEnabled = false }
        check = button("Check feed") { checkFeed() }.apply { isEnabled = false }
        open = button("Open DOMINIC") {
            if (web.url == null) web.loadUrl(ControllerPolicy.HOME)
            web.visibility = View.VISIBLE
        }.apply { isEnabled = false }
        root.addView(buttons)
        root.addView(text("Camera and telemetry only. Flight controls are unavailable. Use Live Drone → Connect Aircraft Bridge inside your inspection."))
        web = WebView(this).apply {
            visibility = View.GONE
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            // The production HTTPS page consumes only loopback HTTP/WS media.
            // Network security config rejects cleartext to every other host.
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    return !ControllerPolicy.allowsPage(request.url.toString())
                }
                @Deprecated("Required for older supported controller WebViews")
                override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                    return !ControllerPolicy.allowsPage(url)
                }
            }
        }
        root.addView(web, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
        handler.post(refreshFeed)
        if (!ControllerPolicy.hasAppKey(sdkAppKey())) {
            status.text = "DJI app key missing. Build with a DJI MSDK V5 key registered to $packageName."
            start.isEnabled = false
        }
    }

    private fun sdkAppKey(): String? {
        val info = packageManager.getApplicationInfo(packageName, PackageManager.GET_META_DATA)
        return info.metaData?.getString("com.dji.sdk.API_KEY")
    }

    private fun requiredPermissions(): Array<String> = buildList {
        add(Manifest.permission.ACCESS_FINE_LOCATION)
        add(Manifest.permission.ACCESS_COARSE_LOCATION)
        add(Manifest.permission.READ_PHONE_STATE)
        if (Build.VERSION.SDK_INT <= 32) add(Manifest.permission.READ_EXTERNAL_STORAGE)
        if (Build.VERSION.SDK_INT <= 28) add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
    }.toTypedArray()

    private fun requestAndStart() {
        val missing = requiredPermissions().filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) requestPermissions(missing.toTypedArray(), 107) else startBridge()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != 107) return
        if (requiredPermissions().all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }) startBridge()
        else status.text = "Required DJI permissions were denied. Tap Start bridge to retry after granting them."
    }

    private fun startBridge() {
        if (host != null || !ControllerPolicy.hasAppKey(sdkAppKey())) return
        start.isEnabled = false
        stop.isEnabled = true
        status.text = "Initializing DJI SDK…"
        val next = DjiMsdkInspectionHost(applicationContext, onStatus = { update ->
            runOnUiThread {
                if (!destroyed) {
                    status.text = when (update) {
                        is DjiMsdkInspectionHost.Status.Initializing -> "SDK initialization: ${update.event} · ${update.progress}%"
                        DjiMsdkInspectionHost.Status.Registering -> "Registering DJI SDK; internet connection required."
                        DjiMsdkInspectionHost.Status.Registered -> "DJI SDK registered."
                        is DjiMsdkInspectionHost.Status.RegistrationFailed -> "DJI registration failed: ${update.error}"
                        is DjiMsdkInspectionHost.Status.BridgeStarted -> {
                            check.isEnabled = true
                            open.isEnabled = true
                            "Bridge started · ${update.websocketEndpoint} · tap Check feed."
                        }
                        is DjiMsdkInspectionHost.Status.ProductConnected -> "DJI product connected. Check feed to verify camera and telemetry."
                        is DjiMsdkInspectionHost.Status.ProductDisconnected -> "DJI product disconnected."
                        is DjiMsdkInspectionHost.Status.ProductChanged -> "DJI product changed. Repeat the feed check."
                        is DjiMsdkInspectionHost.Status.DatabaseDownload -> "DJI database download: ${update.current} / ${update.total}"
                        DjiMsdkInspectionHost.Status.Stopped -> "Bridge stopped."
                    }
                }
            }
        })
        host = next
        runCatching { next.start() }.onFailure {
            stopBridge()
            status.text = "Bridge initialization failed: ${it.message}"
        }
    }

    private fun checkFeed() {
        probe?.close()
        telemetryFrames = 0
        previewFrames = 0
        aircraftConnected = false
        lastTelemetryAt = 0
        lastPreviewAt = 0
        bench.text = "Checking local bridge handshake…"
        val client = object : WebSocketClient(URI("ws://127.0.0.1:8787")) {
            override fun onOpen(handshake: ServerHandshake) {}
            override fun onMessage(message: String) {
                val data = runCatching { JSONObject(message) }.getOrNull() ?: return
                if (data.optString("protocol") != "dominic.flight-bridge.v1") return
                runOnUiThread {
                    if (destroyed || probe !== this) return@runOnUiThread
                    when (data.optString("type")) {
                        "hello" -> bench.text = "Bridge handshake received. Waiting for aircraft telemetry and camera preview."
                        "telemetry" -> { telemetryFrames++; lastTelemetryAt = System.currentTimeMillis(); aircraftConnected = data.optJSONObject("state")?.optBoolean("connected") == true }
                        "camera_preview" -> { previewFrames++; lastPreviewAt = System.currentTimeMillis() }
                    }
                    if (telemetryFrames > 0 || previewFrames > 0) {
                        bench.text = "Aircraft: ${if (aircraftConnected) "connected" else "not connected"} · telemetry: $telemetryFrames · preview frames: $previewFrames. Counts verify transport, not image accuracy."
                    }
                }
            }
            override fun onClose(code: Int, reason: String, remote: Boolean) {
                runOnUiThread { if (!destroyed && probe === this) bench.text = "Feed check disconnected. Tap Check feed to retry." }
            }
            override fun onError(error: Exception) {
                runOnUiThread { if (!destroyed && probe === this) bench.text = "Feed check failed: ${error.message}" }
            }
        }
        probe = client
        client.connect()
    }

    private fun stopBridge() {
        probe?.close()
        probe = null
        val previous = host
        host = null
        runCatching { previous?.stop() }
        check.isEnabled = false
        open.isEnabled = false
        stop.isEnabled = false
        start.isEnabled = ControllerPolicy.hasAppKey(sdkAppKey())
        status.text = "Bridge stopped."
        bench.text = "No active feed check."
    }

    override fun onDestroy() {
        destroyed = true
        handler.removeCallbacks(refreshFeed)
        stopBridge()
        web.stopLoading()
        web.destroy()
        super.onDestroy()
    }
}
