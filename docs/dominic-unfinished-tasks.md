# DOMINIC remaining delivery work

Reviewed 2026-10-12 against main 97464fa22abaed5dd0e9914223939918cb024c60 (PR #258).

## What the baseline already contains

Recent merged work includes Live Flight workspace integration, explicit 5/10/30-second sampled RGB screening, recoverable/deduplicated screening jobs, persisted urgent-first finding review, bounded inspection pages, complete reports, and transactional finding/maintenance history. PRs #248-258 describe the software validations and their limits. An empty issue tracker is not evidence of a finished product.

## Ordered unfinished work

1. **Matrice 4E end-to-end hardware acceptance.** Finish the controller application/key and installation acceptance, record controller/application/aircraft versions, then prove an operator-supervised grounded capture path: connection, telemetry, preview, real photo, owned saved evidence, screening, review and exported findings. Retain logs and real evidence. PR #259 fixes a prerequisite: simulation, skipped command/media checks, unrelated camera events, stale telemetry and another aircraft's report must not count as physical bench verification. No physical aircraft acceptance or flight is performed by that PR. A software bench result is not flight authorization.
2. **Continuous anomaly detection/tracking and measured accuracy.** Evaluate labeled representative industrial RGB data and measure missed defects, false alarms, image-quality sensitivity and reviewer outcomes. Move beyond interval snapshots to validated inference/tracking with latency/throughput measurements, repeated-detection association, backpressure, reconnect handling and explicit cost limits. Existing 5/10/30-second sampling is not every-frame tracking. Keep candidate suggestions separate from inspector-confirmed findings.
3. **Calibrated real-world AR.** Validate camera calibration, pose/telemetry timing, range/anchor registration and overlay error against measured targets. Preview rendering and geometry unit tests are not field registration proof.
4. **Controlled autonomous capture.** Validate mission/controller imports, pause/resume/abort, return-home and loss-of-link behavior, and pilot intervention on actual supported configurations. Prove controlled flight before operational use. Adapter interfaces and generated mission packages alone do not establish model compatibility.
5. **Operational industrial HUB, fleet and docks.** Complete hardware-backed dock/scheduler/fleet integration, safe mission handoff, alerts and audit evidence. Keep simulated and physical operations clearly separated.
6. **Thermal and LDAR validation.** Integrate and validate suitable physical payloads, radiometric interpretation/calibration and gas-sensor evidence. RGB screening on the current 4E must not be presented as thermal measurement or verified leak detection.
7. **Broader aircraft integrations.** Record and test support per aircraft/controller/payload/software combination. A common interface or mocked adapter is not proof of vendor-specific hardware support.
8. **Commercial, offline and signed delivery acceptance.** Complete release acceptance for licensing/entitlements, interrupted field work and offline recovery/sync, signed application distribution and client handoff. Existing report/export features are not being classified as absent; the outstanding item is full release and field acceptance with retained evidence.

The next externally blocked milestone is the physical 4E acceptance run. While hardware is unavailable, detector evaluation and video-pipeline work can proceed without pretending the aircraft has been validated.

## PR #259 scope and limits

The bench report checks the adapter's declared vendor; it cannot independently attest physical hardware or detect an SDK simulator that falsely declares itself as a physical adapter. It confirms a matching photo metadata event, not successful image decoding, durable evidence storage, AI accuracy, regulatory compliance, or safe flight. Existing validation records are not migrated or retrospectively certified by this patch.

The local harness executes targeted assertions with Node's test/assert modules against TypeScript-transpiled source. It is not a full Next.js build or a substitute for the repository's Vitest, isolated E2E, deployment and production checks. Actual CI results and any release status belong in PR #259; no physical validation is implied by automated checks.
