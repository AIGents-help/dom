package com.droneopsman.dominicbridge

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.view.Gravity
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val status = TextView(this).apply {
            text = buildString {
                append("DOMINIC DJI Flight Bridge\n\n")
                append("MSDK: ")
                append(DominicBridgeRuntime.sdkState)
                append("\nProduct: ")
                append(DominicBridgeRuntime.connectedProductId ?: "not connected")
                append("\n\nRead-only telemetry is the first hardware validation stage.")
            }
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.rgb(12, 17, 22))
            textSize = 18f
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
        }

        setContentView(status)
    }
}
