package com.droneopsman.dominic.flightbridge

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InspectionBridgeOriginTest {
    @Test fun permitsProductionAndLocalClients() {
        listOf(null, "", "https://droneopsman.com", "https://www.droneopsman.com", "http://localhost:3000", "http://127.0.0.1:3000").forEach {
            assertTrue("Expected allowed origin: $it", isAllowedInspectionWebOrigin(it))
        }
    }
    @Test fun rejectsForeignAndDisguisedOrigins() {
        listOf("null", "https://foreign.example", "https://droneopsman.com.foreign.example", "https://droneopsman.com@foreign.example", "https://foreign.example@droneopsman.com", "http://droneopsman.com", "https://droneopsman.com:444", "https://droneopsman.com/path", "https://droneopsman.com?query=1", "https://droneopsman.com#fragment", "http://localhost.foreign.example", "https://[bad").forEach {
            assertFalse("Expected rejected origin: $it", isAllowedInspectionWebOrigin(it))
        }
    }
}
