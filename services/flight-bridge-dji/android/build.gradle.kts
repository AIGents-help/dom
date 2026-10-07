plugins {
    id("com.android.library")
    kotlin("android")
}

android {
    namespace = "com.droneopsman.dominic.flightbridge"
    compileSdk = 35

    defaultConfig {
        minSdk = 24
        manifestPlaceholders["DOMINIC_DJI_API_KEY"] =
            providers.gradleProperty("DOMINIC_DJI_API_KEY").orElse("__MISSING_DJI_API_KEY__").get()
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    testImplementation("junit:junit:4.13.2")
    implementation("com.dji:dji-sdk-v5-aircraft:5.18.0")
    implementation("com.dji:dji-sdk-v5-networkImp:5.18.0")
    implementation("com.dji:wpmzsdk:1.0.5.1")
    compileOnly("com.dji:dji-sdk-v5-aircraft-provided:5.18.0")
    implementation("org.java-websocket:Java-WebSocket:1.6.0")
}
