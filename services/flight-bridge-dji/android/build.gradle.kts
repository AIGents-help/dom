plugins {
    id("com.android.library")
    kotlin("android")
}

android {
    namespace = "com.droneopsman.dominic.flightbridge"
    compileSdk = 35

    defaultConfig {
        minSdk = 24
    }
}

dependencies {
    implementation("com.dji:dji-sdk-v5-aircraft:5.18.0")
    compileOnly("com.dji:dji-sdk-v5-aircraft-provided:5.18.0")
    implementation("org.java-websocket:Java-WebSocket:1.6.0")
}
