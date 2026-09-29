# DOMINIC Autel Flight Bridge

Autel integration follows the same rule as DJI and MAVLink:

**Autel SDK/native control -> DOMINIC Flight Bridge v1 -> Universal Aircraft Interface**

The native Autel bridge must normalize supported aircraft telemetry into
`UniversalAircraftState`, publish an explicit capability manifest, and translate only
supported DOMINIC commands into the connected aircraft SDK.

DOMINIC Capture Planner and the mission engine do not contain Autel-specific logic.

## Current executable bridge core

Autel now has the same transport-independent DOMINIC Flight Bridge boundary as DJI:

- `services/flight-bridge-autel/session.ts` composes `AutelSdkDriver` with the universal bridge session,
- `services/flight-bridge-autel/host.ts` binds that session to the shared text/WebSocket host,
- active Autel payload metadata is advertised in the `hello` handshake,
- supported DOMINIC commands are capability-gated and routed to the Autel driver,
- telemetry and camera media use the universal DOMINIC message shapes, and
- capture media preserves the originating checkpoint ID for coverage/QC correlation.

The session contract is covered by `services/flight-bridge-autel/session.test.ts`.
The remaining vendor-specific work is the concrete Autel native SDK implementation of
`AutelSdkDriver` and hardware validation on supported enterprise aircraft/controllers.

Recommended rollout:

1. Read-only connection/model/GPS/battery telemetry.
2. Gimbal/camera telemetry and still capture.
3. Return-home/land controls.
4. Mission pause/resume and movement commands where supported.
5. SITL/vendor simulator or hardware-in-the-loop validation.
6. Controlled field testing before autonomous use.

The bridge should expose a local/reachable WebSocket endpoint and speak
`dominic.flight-bridge.v1`.
