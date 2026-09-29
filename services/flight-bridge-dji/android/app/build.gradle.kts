plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val minSdkVersionValue = providers.gradleProperty("ANDROID_MIN_SDK_VERSION").get().toInt()
val targetSdkVersionValue = providers.gradleProperty("ANDROID_TARGET_SDK_VERSION").get().toInt()
val compileSdkVersionValue = providers.gradleProperty("ANDROID_COMPILE_SDK_VERSION").get().toInt()
val djiSdkVersion = providers.gradleProperty("DJI_MSDK_VERSION").get()
val djiApiKey = providers.gradleProperty("DJI_API_KEY").orNull ?: ""

android {
    namespace = "com.droneopsman.dominicbridge"
    compileSdk = compileSdkVersionValue

    defaultConfig {
        applicationId = "com.droneopsman.dominicbridge"
        minSdk = minSdkVersionValue
        targetSdk = targetSdkVersionValue
        versionCode = 1
        versionName = "0.1.0"

        manifestPlaceholders["DJI_API_KEY"] = djiApiKey

        ndk {
            abiFilters += listOf("arm64-v8a")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("com.dji:dji-sdk-v5-aircraft:$djiSdkVersion")
    compileOnly("com.dji:dji-sdk-v5-aircraft-provided:$djiSdkVersion")
    runtimeOnly("com.dji:dji-sdk-v5-networkImp:$djiSdkVersion")
}
