# DOMINIC DJI Android host

This directory is the native Android boundary for DJI Mobile SDK V5.

The first hardware milestone is intentionally **read-only**:

- register/connect DJI MSDK V5 on the Android controller,
- read Matrice 4E telemetry,
- expose a loopback WebSocket at `ws://127.0.0.1:8787`,
- send `dominic.flight-bridge.v1` hello + telemetry frames,
- refuse every aircraft/payload command.

DJI currently lists Android Mobile SDK V5 5.18.0 and Matrice 4E as supported. The
native app should pin the DJI SDK version during hardware validation rather than float
to a newer release.

## Boundary

`DominicReadOnlyBridgeService` owns the local socket lifecycle. It depends only on an
`MsdkTelemetryProvider`; DJI KeyManager-specific code belongs in the provider, not in
DOMINIC's protocol/server layer.

This keeps the safety rule explicit: getting live telemetry working does **not** grant
movement or camera authority.

## Next native step

Implement `DjiKeyManagerTelemetryProvider` against the DJI V5 KeyManager/KeyTools APIs,
then exercise it first with the DJI sample/simulator and finally with the Matrice 4E
controller. Do not enable movement commands in this stage.
