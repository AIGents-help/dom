# DOMINIC remaining delivery work

Reviewed 2026-10-12 against main 97464fa22abaed5dd0e9914223939918cb024c60 (PR #258).

## What the baseline already contains

Recent merged work includes real Live Flight workspace integration, explicit 5/10/30-second sampled RGB screening, recoverable/deduplicated screening jobs, persisted urgent-first finding review, bounded inspection pages, complete reports, and transactional finding/maintenance history. PRs #248-258 describe the software validations and their limits. An empty issue tracker is not evidence of a finished product.

## Ordered unfinished work

1. **Validation integrity (this change).** Do not treat simulation, skipped command/media checks, uncorrelated camera events, stale telemetry, a disconnected aircraft, or another aircraft's report as physical bench verification. Regression coverage is software-only. Full repository CI and release checks remain required before merging this change.
2. **Matrice 4E hardware acceptance.** Record the actual controller/application/aircraft versions, then prove an operator-supervised grounded capture path: connection, telemetry, preview, real photo, owned saved evidence, screening, review and exported findings. Retain logs and real evidence. This has not been performed by this change. No motors or flight commands should be enabled merely because this checklist passes.
3. **Measured inspection accuracy.** Evaluate a labeled representative industrial RGB dataset; measure missed defects, false alarms, image quality sensitivity and review outcomes. Separate candidate suggestions from inspector-confirmed findings. Controlled browser fixtures do not establish detector accuracy.
4. **Continuous video analysis.** Move beyond bounded interval snapshots to validated inference/tracking with latency and throughput measurements, repeated-detection association, backpressure, reconnect handling and explicit cost limits. Existing 5/10/30-second sampling is not every-frame tracking.
5. **Controlled autonomous capture and vendor acceptance.** Validate mission/controller imports, pause/resume/abort, loss-of-link behavior and pilot intervention on actual supported configurations. Then prove controlled flight before operational use. Adapter interfaces and generated mission packages alone do not establish model compatibility.
6. **Real-world AR registration.** Validate camera calibration, pose/telemetry timing, range/anchor registration and overlay error against surveyed or otherwise measured targets. Preview rendering and geometry unit tests are not field registration proof.
7. **Thermal and LDAR validation.** Integrate and validate suitable physical payloads, radiometric interpretation/calibration and gas-sensor evidence. RGB screening on the current 4E must not be presented as thermal measurement or verified leak detection.
8. **Operational HUB and broader fleets.** Complete hardware-backed dock/scheduler/fleet integration, safe mission handoff, alerts and audit evidence; certify support per tested aircraft/controller/payload combination. Keep simulated and physical operations clearly separated.

The next externally blocked step is the physical 4E acceptance run. While hardware is unavailable, detector evaluation and bounded video-pipeline work can proceed without pretending the aircraft has been validated.

## This change's limits

The bench report checks the adapter's declared vendor; it cannot independently attest physical hardware or detect an SDK simulator that falsely declares itself as a physical adapter. It confirms a matching photo metadata event, not successful image decoding, durable evidence storage, AI accuracy, regulatory compliance, or safe flight. Existing validation records are not migrated or retrospectively certified by this patch.

The targeted local harness executes the regression assertions with Node's test/assert modules against TypeScript-transpiled source. It is not a full Next.js build or a substitute for the repository's Vitest, isolated E2E, deployment and production checks.
