# DOMINIC DJI Android Bridge

This Android project is the native Mobile SDK V5 host for the DOMINIC Flight Bridge.

## Baseline

- DJI Mobile SDK V5: 5.18.0
- Android compile/target API: 35
- Android minimum API: 24
- ABI: arm64-v8a
- Package: com.droneopsman.dominicbridge

## First hardware milestone

The current Android slice intentionally stops at MSDK initialization, app registration
and DJI product connect/disconnect lifecycle. It does not yet issue flight commands.

Before building, set `DJI_API_KEY` in a local Gradle property or secure build
configuration. Do not commit the actual DJI application key.

Open this directory as an Android Studio project and run it on the supported DJI
controller/device. A successful first hardware test should show MSDK registration and a
connected product ID while DOMINIC remains in read-only telemetry mode.

## Next native slice

Implement the KeyManager-backed telemetry source for:

- aircraft location and altitude,
- heading/attitude,
- battery,
- GNSS/satellite status,
- RTK state,
- gimbal pitch/yaw,
- camera mode,
- home point,
- flight/failsafe state.

That native state will feed the already-tested DOMINIC read-only, payload-control,
recovery-control and authorized-autonomy bridge stages.
