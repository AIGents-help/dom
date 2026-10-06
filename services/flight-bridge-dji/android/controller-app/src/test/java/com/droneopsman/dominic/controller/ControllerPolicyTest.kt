package com.droneopsman.dominic.controller

import org.junit.Assert.*
import org.junit.Test

class ControllerPolicyTest {
    @Test fun permitsProductionPagesOnly() {
        assertTrue(ControllerPolicy.allowsPage(ControllerPolicy.HOME))
        assertTrue(ControllerPolicy.allowsPage("https://www.droneopsman.com/dominic/login"))
        for (url in listOf("http://droneopsman.com", "https://droneopsman.com.evil.test", "https://evil.test@droneopsman.com", "https://droneopsman.com:8443", "file:///tmp/a", "javascript:alert(1)", "https://preview.vercel.app")) {
            assertFalse(url, ControllerPolicy.allowsPage(url))
        }
    }
    @Test fun missingKeyCannotStartHardwareSession() {
        assertFalse(ControllerPolicy.hasAppKey(null))
        assertFalse(ControllerPolicy.hasAppKey(" "))
        assertFalse(ControllerPolicy.hasAppKey("__MISSING_DJI_API_KEY__"))
        assertTrue(ControllerPolicy.hasAppKey("configured-key"))
    }
}
