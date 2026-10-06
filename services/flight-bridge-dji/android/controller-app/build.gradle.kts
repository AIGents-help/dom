plugins {
    id("com.android.application")
    kotlin("android")
}

val djiKey = providers.gradleProperty("DOMINIC_DJI_API_KEY")
    .orElse(providers.environmentVariable("DOMINIC_DJI_API_KEY"))
    .orElse("__MISSING_DJI_API_KEY__")

android {
    namespace = "com.droneopsman.dominic.controller"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.droneopsman.dominic.controller"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0-bench"
        manifestPlaceholders["DOMINIC_DJI_API_KEY"] = djiKey.get()
        ndk { abiFilters += "arm64-v8a" }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    packaging {
        jniLibs {
            useLegacyPackaging = true
            pickFirsts += "**/libc++_shared.so"
            keepDebugSymbols += "**/*.so"
        }
    }
}
kotlin { jvmToolchain(17) }

dependencies {
    implementation(project(":"))
    implementation("com.dji:dji-sdk-v5-aircraft:5.18.0")
    compileOnly("com.dji:dji-sdk-v5-aircraft-provided:5.18.0")
    implementation("org.java-websocket:Java-WebSocket:1.6.0")
    testImplementation("junit:junit:4.13.2")
}

tasks.register("requireDjiAppKey") {
    doLast {
        check(djiKey.get().isNotBlank() && djiKey.get() != "__MISSING_DJI_API_KEY__") {
            "Set DOMINIC_DJI_API_KEY for com.droneopsman.dominic.controller before building a hardware APK."
        }
    }
}
