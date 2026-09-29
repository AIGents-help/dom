package com.droneopsman.dominicbridge

import android.app.Application
import android.content.Context
import android.util.Log
import dji.v5.common.error.IDJIError
import dji.v5.common.register.DJISDKInitEvent
import dji.v5.manager.SDKManager
import dji.v5.manager.interfaces.SDKManagerCallback

object DominicBridgeRuntime {
    @Volatile
    var sdkState: String = "starting"

    @Volatile
    var connectedProductId: Int? = null
}

class DominicBridgeApplication : Application() {
    private val tag = "DOMINIC-DJI"

    override fun attachBaseContext(base: Context?) {
        super.attachBaseContext(base)
        com.cySdkyc.clx.Helper.install(this)
    }

    override fun onCreate() {
        super.onCreate()
        DominicBridgeRuntime.sdkState = "initializing"

        SDKManager.getInstance().init(this, object : SDKManagerCallback {
            override fun onInitProcess(event: DJISDKInitEvent?, totalProcess: Int) {
                DominicBridgeRuntime.sdkState = "initializing:$totalProcess"
                Log.i(tag, "MSDK init event=$event progress=$totalProcess")
                if (event == DJISDKInitEvent.INITIALIZE_COMPLETE) {
                    DominicBridgeRuntime.sdkState = "registering"
                    SDKManager.getInstance().registerApp()
                }
            }

            override fun onRegisterSuccess() {
                DominicBridgeRuntime.sdkState = "registered"
                Log.i(tag, "MSDK registration succeeded")
            }

            override fun onRegisterFailure(error: IDJIError?) {
                DominicBridgeRuntime.sdkState = "registration_failed"
                Log.e(tag, "MSDK registration failed: ${error?.description()}")
            }

            override fun onProductConnect(productId: Int) {
                DominicBridgeRuntime.connectedProductId = productId
                DominicBridgeRuntime.sdkState = "product_connected"
                Log.i(tag, "DJI product connected: $productId")
            }

            override fun onProductDisconnect(productId: Int) {
                if (DominicBridgeRuntime.connectedProductId == productId) {
                    DominicBridgeRuntime.connectedProductId = null
                }
                DominicBridgeRuntime.sdkState = "product_disconnected"
                Log.w(tag, "DJI product disconnected: $productId")
            }

            override fun onProductChanged(productId: Int) {
                DominicBridgeRuntime.connectedProductId = productId
                Log.i(tag, "DJI product changed: $productId")
            }

            override fun onDatabaseDownloadProgress(current: Long, total: Long) {
                if (total > 0L) {
                    Log.d(tag, "DJI database download: $current/$total")
                }
            }
        })
    }
}
