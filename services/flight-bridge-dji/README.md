# DOMINIC DJI Flight Bridge

The DJI bridge is an Android Mobile SDK V5 integration that runs beside DJI Pilot/RC
hardware and speaks the same DOMINIC Flight Bridge v1 WebSocket protocol used by every
other aircraft family.

DOMINIC itself does not import DJI SDK types. The Android bridge must translate:

## Current implementation

The repository now contains a transport-agnostic DJI bridge session core in
`services/flight-bridge-dji/session.ts`. A native DJI Mobile SDK V5 driver implements
`DjiSdkDriver`; the session then reuses DOMINIC's universal bridge server to:

- publish `hello` with DJI capabilities and active camera payload metadata,
- stream normalized aircraft telemetry,
- route DOMINIC commands into the DJI driver,
- capability-gate unsupported commands,
- return `command_result` / protocol errors,
- forward camera media with the originating capture checkpoint ID, and
- emit heartbeats using the same bridge protocol as MAVLink and future vendors.

The session contract is covered by `services/flight-bridge-dji/session.test.ts`.
The repository also includes a tested text/WebSocket host boundary:

- `lib/aircraft/bridgeWireHost.ts` serializes the universal bridge session onto a native text socket,
- malformed traffic returns protocol errors instead of crashing the bridge,
- native socket closure stops the aircraft session cleanly, and
- `services/flight-bridge-dji/host.ts` composes that wire host with the DJI session.

The Android controller app therefore only needs to provide a local WebSocket/text-socket
adapter and the concrete Mobile SDK V5 implementation of `DjiSdkDriver`; DOMINIC hello,
telemetry, command results, media correlation, heartbeat, and protocol parsing are already
handled by the shared tested bridge core.

## DJI -> DOMINIC telemetry

- aircraft connection/model/serial identifier
- latitude/longitude
- relative altitude
- aircraft heading
- horizontal/vertical velocity
- battery percentage
- satellite/GNSS quality
- RTK status
- gimbal pitch/yaw
- camera mode
- obstacle/vision warning state
- current flight mode
- home point
- failsafe/health state

into the DOMINIC `UniversalAircraftState` shape.

## DOMINIC -> DJI commands

The bridge receives the versioned DOMINIC command vocabulary:

- arm
- takeoff
- goTo
- setVelocity
- setYaw
- setGimbal
- capturePhoto
- startVideo / stopVideo
- pause / resume
- returnHome
- land
- abort

The bridge must capability-gate each command using the connected product and MSDK API
availability, then return `command_result`.

## Connection

The bridge should expose a local WebSocket endpoint, normally:

```
ws://127.0.0.1:8787
```

or an address reachable from the device running DOMINIC.

The first message sent to a DOMINIC client must be `hello` using
`dominic.flight-bridge.v1`, followed by normalized `telemetry` messages.

## Safe read-only hardware stage

Before any autonomous command is enabled on a physical DJI aircraft, DOMINIC can run the
bridge in **read-only telemetry mode** using `DjiTelemetryOnlyDriver`.

That mode deliberately advertises:

- telemetry: enabled,
- RTK / obstacle sensing: enabled only when the native source reports support,
- arm, takeoff, go-to, velocity, yaw, gimbal, camera, video, pause/resume, RTH and land: disabled.

This lets the Android MSDK V5 binding validate live Matrice telemetry, controller/network
stability, payload identity and DOMINIC state rendering without giving DOMINIC authority
to move the aircraft. Any inbound flight command is rejected at the capability boundary
before it can reach native DJI hardware.

## Payload-control hardware stage

After read-only telemetry is stable, DOMINIC can move to a deliberately limited
**payload-control validation mode** using `DjiPayloadControlDriver` and
`createDjiPayloadControlFlightBridgeHost`.

This stage can advertise and route only the native capabilities explicitly confirmed by
the DJI source:

- gimbal control,
- still-image capture,
- video start/stop,
- telemetry, RTK and obstacle state.

Aircraft movement authority remains disabled: arm, takeoff, go-to, velocity, yaw,
pause/resume, return-home, land and abort are all rejected at the capability boundary.
That allows a Matrice/controller bench or props-off test to validate payload identity,
gimbal motion, camera capture, media correlation and DOMINIC image-quality ingestion
before any movement command is enabled.

The payload-control host is covered by
`services/flight-bridge-dji/payloadControlHost.test.ts`, including proof that a takeoff
command is rejected while gimbal/photo commands are accepted.

## Recovery-control hardware stage

After payload controls are validated, DOMINIC can move to a controlled-field
**recovery-control mode** using `DjiRecoveryControlDriver` and
`createDjiRecoveryControlFlightBridgeHost`.

This stage may explicitly enable:

- pause / resume,
- return-home,
- land,
- emergency abort,
- the already-validated telemetry, gimbal, photo and video controls.

It still refuses autonomous movement authority: arm, takeoff, go-to, velocity control
and aircraft yaw remain disabled. Every recovery capability is opt-in from the native
DJI source; if MSDK or the connected product does not advertise/validate one of them,
DOMINIC rejects that command before it reaches hardware.

This stage is intended for controlled-field validation of recovery behavior before
autonomous movement is enabled.

## Autonomous-movement unlock stage

Autonomous movement is not enabled merely because DJI MSDK reports that the aircraft can
arm, take off or navigate. The final bridge stage uses
`DjiAutonomousControlDriver` with a short-lived `DjiAutonomyAuthorization`.

An unlock is valid only when all of the following are true:

- the authorization names the exact connected aircraft ID,
- controlled-field validation has been confirmed,
- the operator has explicitly confirmed the unlock,
- the authorization start time has been reached, and
- the authorization has not expired.

Only then can the bridge advertise native movement capabilities such as arm, takeoff,
go-to, velocity control and aircraft yaw. Each movement command re-checks the
authorization at execution time, so an expired authorization cannot continue commanding
the aircraft after the bridge has already connected.

Native source capability flags are still required as a second gate; authorization never
creates a capability that the connected DJI product/SDK does not actually expose.

## Hardware rollout

1. Build and validate against DJI Mobile SDK V5 sample/simulator.
2. Run on the supported controller/Android environment.
3. Validate read-only telemetry first.
4. Enable gimbal and camera commands.
5. Validate RTH/land and mission pause/abort.
6. Enable autonomous movement commands only after HITL/controlled field validation.

This directory is intentionally limited to the native bridge boundary. Capture Planner,
mission geometry, safety calibration, and mission execution remain vendor-neutral inside
DOMINIC.
