package com.droneopsman.dominic.flightbridge

import android.content.Context
import dji.v5.common.error.IDJIError
import dji.v5.common.register.DJISDKInitEvent
import dji.v5.manager.SDKManager
import dji.v5.manager.interfaces.SDKManagerCallback
import dji.v5.network.DJINetworkManager
import dji.v5.network.IDJINetworkStatusListener
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Owns DJI MSDK registration and the read-only DOMINIC bridge lifecycle.
 *
 * This host never enables aircraft control. It starts the local Flight Bridge only after
 * DJI app registration succeeds.
 */
class DjiMsdkReadOnlyHost(
    private val context: Context,
    private val bridgeId: String = "dominic-dji-controller",
    private val port: Int = 8787,
    private val onStatus: (Status) -> Unit = {},
) {
    sealed class Status {
        data class Initializing(val event: DJISDKInitEvent, val progress: Int) : Status()
        object Registering : Status()
        object Registered : Status()
        data class RegistrationFailed(val error: IDJIError) : Status()
        data class ProductConnected(val productId: Int) : Status()
        data class ProductDisconnected(val productId: Int) : Status()
        data class ProductChanged(val productId: Int) : Status()
        data class DatabaseDownload(val current: Long, val total: Long) : Status()
        data class BridgeStarted(val endpoint: String) : Status()
        object Stopped : Status()
    }

    private val started = AtomicBoolean(false)
    private val initialized = AtomicBoolean(false)
    private val bridgeStarted = AtomicBoolean(false)
    private var bridgeRuntime: DjiReadOnlyBridgeRuntime? = null

    private val networkStatusListener = IDJINetworkStatusListener { available ->
        if (
            available &&
            initialized.get() &&
            !SDKManager.getInstance().isRegistered
        ) {
            onStatus(Status.Registering)
            SDKManager.getInstance().registerApp()
        }
    }

    private val sdkCallback = object : SDKManagerCallback {
        override fun onRegisterSuccess() {
            onStatus(Status.Registered)
            startBridgeOnce()
        }

        override fun onRegisterFailure(error: IDJIError) {
            onStatus(Status.RegistrationFailed(error))
        }

        override fun onProductDisconnect(productId: Int) {
            onStatus(Status.ProductDisconnected(productId))
        }

        override fun onProductConnect(productId: Int) {
            onStatus(Status.ProductConnected(productId))
        }

        override fun onProductChanged(productId: Int) {
            onStatus(Status.ProductChanged(productId))
        }

        override fun onInitProcess(event: DJISDKInitEvent, totalProcess: Int) {
            onStatus(Status.Initializing(event, totalProcess))
            if (
                event == DJISDKInitEvent.INITIALIZE_COMPLETE &&
                initialized.compareAndSet(false, true)
            ) {
                onStatus(Status.Registering)
                SDKManager.getInstance().registerApp()
            }
        }

        override fun onDatabaseDownloadProgress(current: Long, total: Long) {
            onStatus(Status.DatabaseDownload(current, total))
        }
    }

    fun start() {
        if (!started.compareAndSet(false, true)) return

        DJINetworkManager.getInstance().addNetworkStatusListener(networkStatusListener)
        SDKManager.getInstance().init(context.applicationContext, sdkCallback)
    }

    fun stop() {
        if (!started.compareAndSet(true, false)) return

        DJINetworkManager.getInstance().removeNetworkStatusListener(networkStatusListener)
        bridgeRuntime?.stop()
        bridgeRuntime = null
        bridgeStarted.set(false)
        initialized.set(false)
        SDKManager.getInstance().destroy()
        onStatus(Status.Stopped)
    }

    private fun startBridgeOnce() {
        if (!started.get() || !bridgeStarted.compareAndSet(false, true)) return

        val runtime = DjiReadOnlyBridgeRuntime(
            bridgeId = bridgeId,
            missionValidator = DominicDjiMissionValidator(context.applicationContext),
            port = port,
        )
        bridgeRuntime = runtime
        runtime.start()
        onStatus(Status.BridgeStarted("ws://127.0.0.1:$port"))
    }
}
