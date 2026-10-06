package com.droneopsman.dominic.controller

import android.app.Application
import android.content.Context

class ControllerApplication : Application() {
    override fun attachBaseContext(base: Context) {
        super.attachBaseContext(base)
        com.cySdkyc.clx.Helper.install(this)
    }
}
