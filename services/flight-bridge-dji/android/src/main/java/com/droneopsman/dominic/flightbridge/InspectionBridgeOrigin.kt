package com.droneopsman.dominic.flightbridge

import java.net.URI

/** Browsers always send Origin; prevent other websites from reading the camera. */
internal fun isAllowedInspectionWebOrigin(origin: String?): Boolean {
    if (origin.isNullOrEmpty()) return true // Native loopback clients have no browser Origin.
    val uri = runCatching { URI(origin) }.getOrNull() ?: return false
    if (uri.rawUserInfo != null || !uri.rawPath.isNullOrEmpty() || uri.rawQuery != null || uri.rawFragment != null) return false
    return when (uri.host) {
        "droneopsman.com", "www.droneopsman.com" -> uri.scheme == "https" && uri.port in setOf(-1, 443)
        "localhost", "127.0.0.1", "[::1]" -> uri.scheme in setOf("http", "https")
        else -> false
    }
}
