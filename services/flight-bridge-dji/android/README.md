# DOMINIC DJI Android host

This directory is the native Android boundary for DJI Mobile SDK V5.

The first hardware milestone remains intentionally **read-only**:

- initialize/register DJI Mobile SDK V5 on the Android controller,
- subscribe to Matrice telemetry through DJI `KeyManager`,
- expose a loopback WebSocket at `ws://127.0.0.1:8787`,
- send the exact `dominic.flight-bridge.v1` hello / telemetry / heartbeat contract,
- reject every aircraft and payload command.

The module pins DJI Mobile SDK V5 5.18.0 for Matrice 4E hardware validation.

## MSDK host lifecycle

`DjiMsdkReadOnlyHost` now owns the registration lifecycle used by DJI's V5 sample:

1. `SDKManager.init(...)`
2. wait for `DJISDKInitEvent.INITIALIZE_COMPLETE`
3. call `SDKManager.registerApp()`
4. retry registration when network returns if the SDK is not registered
5. start `DjiReadOnlyBridgeRuntime` only after `onRegisterSuccess()`
6. stop the bridge and destroy MSDK together

Product connection/disconnection, registration failures, init progress and database
download progress are surfaced through the host status callback.

Example:

```kotlin
private val dominicHost = DjiMsdkReadOnlyHost(
    context = applicationContext,
    bridgeId = "dominic-matrice-4e",
) { status ->
    Log.i("DOMINIC", "DJI bridge status: $status")
}

fun onCreate() {
    dominicHost.start()
}

fun onDestroy() {
    dominicHost.stop()
}
```

## DJI application key

The DJI application key is **not committed to this repository**.

The library manifest declares DJI's required metadata entry:

```xml
<meta-data
    android:name="com.dji.sdk.API_KEY"
    android:value="${DOMINIC_DJI_API_KEY}" />
```

Provide the key to Gradle outside source control, for example in the developer/controller
environment:

```properties
DOMINIC_DJI_API_KEY=your_registered_dji_app_key
```

If the module is copied into DJI's sample project instead of consumed as a library, map
the same secret to that project's `API_KEY` / `AIRCRAFT_API_KEY` placeholder.

## Telemetry boundary

`DjiKeyManagerTelemetryProvider` reads/listens to:

- flight-controller connection,
- flight-controller serial number (DOMINIC aircraft ID),
- DJI product/model type,
- latitude / longitude,
- relative altitude,
- compass heading,
- NED aircraft velocity,
- aggregate battery percentage,
- GPS satellite count, and
- flight mode.

`ReadOnlyProtocol` converts those values to DOMINIC's vendor-neutral state contract,
including meters-to-feet conversion and NED vertical-speed sign conversion.

`LoopbackWebSocketServer` binds only to `127.0.0.1`, so the validation bridge is not
exposed on controller Wi-Fi/LAN interfaces.

The bridge advertises **no movement, recovery, gimbal or camera authority**. All inbound
DOMINIC commands receive a rejected `command_result`.

## Next hardware-validation step

The remaining step is no longer application wiring. It is physical/simulator validation:

1. supply the registered DJI application key outside source control,
2. launch the host on DJI's supported Android/controller environment,
3. verify successful MSDK initialization and registration,
4. connect a WebSocket client to `ws://127.0.0.1:8787`,
5. verify hello, telemetry sequence and one-second heartbeats,
6. compare position, altitude, heading, velocity, battery, satellites and flight mode
   against the DJI simulator/sample UI,
7. repeat the read-only validation on the Matrice 4E/controller.

Do not enable aircraft movement commands until these checks are stable.


## DOMINIC -> DJI mission handoff

Saved map plans can now export a `dominic.dji-mission.v1` JSON package from the DOMINIC
Review screen. The package contains the exact reviewed waypoint coordinates, relative
altitudes, gimbal pitch values and per-waypoint photo intent.

On the Android controller:

```kotlin
val mission = DominicDjiMissionPackage.parse(json)
val exporter = DominicDjiKmzExporter(applicationContext)
val kmzPath = exporter.export(
    mission,
    File(cacheDir, "dominic/${mission.name}.kmz").absolutePath,
)
```

`DominicDjiKmzExporter` uses DJI's own `WPMZManager.generateKMZFile()`, matching the
current DJI MSDK V5 Wayline sample rather than hand-authoring WPML in the browser.

This stage is **file generation only**. The read-only bridge still does not upload the KMZ,
start a mission, arm, take off, or send aircraft-control commands. That authority remains
locked behind the staged hardware-validation work.


## Static DJI mission validation

The read-only controller bridge now accepts a non-flight `mission_validate` request from
DOMINIC. The Android host:

1. parses the reviewed `dominic.dji-mission.v1` package,
2. generates a temporary KMZ with DJI's `WPMZManager.generateKMZFile()`,
3. runs `WPMZManager.checkValidation(kmzPath)`,
4. returns `mission_validation_result` with `valid`, `errors` and DJI's raw validation
   message,
5. deletes the temporary KMZ.

This validation path is intentionally isolated from aircraft execution. It does **not**
call `pushKMZFileToAircraft()`, `startMission()`, arm, take off, or send any movement
command. DOMINIC's Review screen can therefore verify the generated DJI mission file
against DJI's own WPMZ rules before any future upload stage is enabled.
