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
