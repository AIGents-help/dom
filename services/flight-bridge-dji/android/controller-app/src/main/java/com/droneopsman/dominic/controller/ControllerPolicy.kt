package com.droneopsman.dominic.controller

import java.net.URI

/** Shared by the WebView navigation boundary and local controller tests. */
object ControllerPolicy {
    const val HOME = "https://droneopsman.com/dominic"
    fun allowsPage(url: String): Boolean = runCatching {
        val uri = URI(url)
        uri.scheme == "https" && uri.userInfo == null &&
            (uri.port == -1 || uri.port == 443) &&
            uri.host in setOf("droneopsman.com", "www.droneopsman.com")
    }.getOrDefault(false)

    fun hasAppKey(key: String?): Boolean = !key.isNullOrBlank() && key != "__MISSING_DJI_API_KEY__"
}
