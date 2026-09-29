# DOMINIC DJI Android host

This directory is the native Android boundary for DJI Mobile SDK V5.

The first hardware milestone remains intentionally **read-only**:

- connect to DJI Mobile SDK V5 on the Android controller,
- subscribe to Matrice telemetry through DJI `KeyManager`,
- expose a loopback WebSocket at `ws://127.0.0.1:8787`,
- send the exact `dominic.flight-bridge.v1` hello / telemetry / heartbeat contract,
- reject every aircraft and payload command.

DJI currently lists Android Mobile SDK V5 5.18.0 and Matrice 4E as supported. The module
pins 5.18.0 for hardware validation.

## Implemented native boundary

`DjiKeyManagerTelemetryProvider` now reads/listens to:

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

`LoopbackWebSocketServer` uses a local-only `127.0.0.1` socket so this validation bridge
is not exposed on Wi-Fi/LAN interfaces. `DjiReadOnlyBridgeRuntime` composes the telemetry
provider, protocol service and WebSocket server.

The bridge advertises **no movement, recovery, gimbal or camera authority**. All inbound
DOMINIC commands receive a rejected `command_result`.

## Host application integration

The Android controller application remains responsible for registering and activating DJI
MSDK. Start the bridge only after MSDK initialization succeeds:

```kotlin
private val dominicBridge = DjiReadOnlyBridgeRuntime(
    bridgeId = "dominic-dji-controller",
)

fun onMsdkReady() {
    dominicBridge.start()
}

fun onDestroy() {
    dominicBridge.stop()
}
```

The module declares DJI Mobile SDK V5 5.18.0 and Java-WebSocket 1.6.0. If this source is
embedded directly into DJI's sample application instead of included as a library module,
copy those dependencies into the host app's Gradle dependencies.

## Next hardware-validation step

1. Wire this module into the DJI V5 sample/controller application with the registered DJI
   application key.
2. Start the DJI simulator and verify `hello`, telemetry sequencing and heartbeats from
   `ws://127.0.0.1:8787`.
3. Confirm latitude/longitude, altitude, heading, NED speed, battery, satellite count and
   flight mode against DJI Pilot/sample UI.
4. Repeat the read-only test on the Matrice 4E/controller.
5. Add RTK/gimbal/camera telemetry only after the basic stream is stable.
6. Keep all command capabilities disabled until the later controlled hardware stages pass.

No aircraft movement authority is enabled by this module.
