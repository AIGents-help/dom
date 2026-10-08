# DOMINIC DJI Android host

This directory is the native Android boundary for DJI Mobile SDK V5.

The first hardware milestone remains intentionally **read-only**:

- initialize/register DJI Mobile SDK V5 on the Android controller,
- subscribe to Matrice telemetry through DJI `KeyManager`,
- expose a loopback WebSocket at `ws://127.0.0.1:8787`,
- send the exact `dominic.flight-bridge.v1` hello / telemetry / heartbeat contract,
- reject every aircraft and payload command.

The module pins DJI Mobile SDK V5 5.18.0 for Matrice 4E hardware validation.

## Installable controller app

`controller-app` packages this library into an arm64 Android APK. It initializes
DJI's protection helper before loading MSDK, requests SDK permissions, displays
registration/product status, and provides a command-free loopback feed check.
The embedded DOMINIC browser stays in the foreground with the native bridge;
opening this site on your desktop cannot reach the controller's loopback address.
Web navigation is restricted to the production DOM domains. Cleartext network
access is restricted to localhost; no JavaScript/native command interface is exposed.

1. Register a **DJI Mobile SDK V5 Android app** for package
   `com.droneopsman.dominic.controller` in the DJI developer account.
2. Add the resulting key as the GitHub Actions repository secret
   `DOMINIC_DJI_API_KEY` in `AIGents-help/dom` (Settings → Secrets and variables → Actions).
   Keep it out of source code and chat. DJI Android app keys are embedded in the
   installed APK; distribute this bench artifact only to your validation team.
3. On `main`, run **Build DJI Controller Hardware APK** in GitHub Actions and
   download the `dominic-controller-hardware-bench` artifact.
4. Extract the APK and install on the supported controller using its installer,
   or use `adb install -r controller-app-debug.apk` from a connected computer.
5. Open **DOMINIC Controller**, grant the requested permissions, and tap
   **Start bridge** while online for SDK registration.
6. Connect the Matrice 4E, keep it grounded, and tap **Check feed**. Verify a
   handshake, connected aircraft telemetry, and increasing camera preview counts.
7. Tap **Open DOMINIC**, sign in, open the asset inspection's **Plan Capture**,
   select **Live Drone**, then **Connect Aircraft Bridge**.
8. Verify the live preview, save one frame, and compare its image/metadata with
   the aircraft/controller. Confirm its source image and candidate callouts in
   **Review frames & report**. Model candidates still require human review.
9. Disconnect the aircraft and confirm stale frames become unavailable; reconnect
   and repeat. Tap **Stop** when finished. Closing the app ends the native host.

Local build:

```bash
# Set DOMINIC_DJI_API_KEY in your environment or private Gradle properties.
gradle -p services/flight-bridge-dji/android :controller-app:requireDjiAppKey :controller-app:assembleDebug
```

Pull-request verification builds a separate **diagnostic-no-key** APK. It proves
packaging but refuses to start hardware sessions. It is not the keyed hardware APK.
Bench APKs use Gradle's debug signature; builds on different machines may require
uninstalling the previous bench app before installing (clears its local login).
Stable release signing, physical controller testing, and supported-controller
WebView compatibility remain required before wider distribution. This app does
not enable autonomous aircraft flight.

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


## DJI KMZ validation and staging

`DominicDjiMissionStager` is the next controller-side step after KMZ generation.

It uses DJI MSDK V5 directly to:

1. verify the KMZ file exists and is non-empty,
2. call `WPMZManager.checkValidation(kmzPath)`,
3. force DJI's WPMZ parser to load the KMZ through `getKMZInfo(kmzPath)`,
4. retrieve DJI wayline IDs with `WaypointMissionManager.getAvailableWaylineIDs(kmzPath)`,
5. optionally stage the validated KMZ with `pushKMZFileToAircraft(...)`,
6. report upload progress, DJI upload errors, and the final staged state.

Example:

```kotlin
val stager = DominicDjiMissionStager()

val inspection = stager.inspect(kmzPath)
if (inspection.readyToStage) {
    stager.stage(kmzPath) { status ->
        Log.i("DOMINIC", "DJI mission staging: $status")
    }
}
```

This class intentionally exposes **no mission-start API**. Staging a KMZ does not arm,
take off, start a waypoint mission, move the aircraft, operate the payload, or invoke RTH.
Those controls remain outside this validation layer until simulator, bench and controlled
field validation are complete.


## Matrice 4E inspection-camera mode

For inspection evidence capture, use `DjiMsdkInspectionHost` instead of the telemetry-only host.

This mode intentionally exposes a narrow capability set:

- DJI MSDK telemetry
- still-photo capture through `CameraKey.KeyStartShootPhoto`
- original media retrieval through `MediaDataCenter`
- a loopback-only media endpoint at `http://127.0.0.1:8788`
- DOMINIC `media_capture` events that contain the local media URL and capture telemetry

The WebSocket endpoint remains `ws://127.0.0.1:8787`.

Example application host:

```kotlin
val host = DjiMsdkInspectionHost(
    context = applicationContext,
    onStatus = { status ->
        Log.i("DOMINIC", "DJI inspection bridge: $status")
    },
)

host.start()
```

The inspection bridge does **not** expose aircraft movement authority. It rejects arm,
takeoff, go-to, velocity, yaw-flight-control, RTH, landing, pause/resume, and other
movement commands. Still-photo capture is deliberately separated from the autonomous
flight-validation ladder so inspection evidence can be validated with the Matrice 4E
before connected flight execution is enabled.

Captured media is downloaded to the controller application's cache and is published only
on the controller loopback interface with a random media token. DOMINIC can then fetch
the original file and persist it to the active Asset Intelligence inspection.

The current first validation target is Matrice 4E with its integrated RGB camera system.
This is not yet a claim of field validation: the Android camera/media path must still be
compiled in the controller application and verified against real 4E hardware before it
is treated as production-ready.

## Live inspection preview

The inspection host now emits `camera_preview` messages over its existing loopback
WebSocket. DJI's decoded RGBA callback is sampled at up to 2 frames/second, resized
to at most 960 pixels on either side, and encoded as bounded JPEG payloads.
Browser camera access is limited to the production DOM origins and localhost
development origins; foreign website handshakes are rejected. Native loopback
clients may omit the browser Origin header. Vercel preview domains are not
permitted to connect to the physical controller by default.
Frames are dropped while encoding is busy or a socket has buffered data. Only
wide/zoom camera sources are accepted; infrared preview is not labelled RGB.
No preview is written to disk by the controller and no shutter, recording, or
flight command is issued by this path.

In DOMINIC, open an asset inspection's **Plan Capture**, choose **Live Drone**,
and connect the inspection bridge. **Inspect this frame** saves the selected
preview to private inspection evidence and uses the existing AI screening queue.
Optional sampling defaults to 30 seconds; the pilot may explicitly choose 10 or
5 seconds. Every automatic run is capped at 30 frames and waits for the preceding
save/screening job rather than queuing a backlog. Only current, decoded, previously
unsent frames are eligible. Hidden tabs, offline browsers, and stale camera feeds
pause sampling; an AI/provider error turns it off while retaining saved evidence.
Restarting approves another run. Faster cadence may increase evidence storage and
AI charges; this is sampled RGB screening, not every-frame video analysis.
The camera feed is separate from annotated evidence: callouts belong to the saved
frame, not a later preview. Missing telemetry is stored as unknown. The web view
pauses inspection after five seconds without a received frame.

This is a low rate preview, not a full motion video stream. Continuous video
inference, automatic geometric alignment, and physical aircraft validation remain
unfinished. Install/rebuild the native host with this bridge version and your
registered DJI SDK key before testing on a supported controller. The browser test
uses a photorealistic JPEG fixture; it does not validate DJI hardware or anomaly
accuracy.
