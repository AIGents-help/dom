# DOMINIC Accuracy Lab

Open `/dominic/evaluation`, or select **Accuracy Lab** in the desktop navigation
or the mobile All modules menu. The navigation link opens a separate tab so an
existing flight/planning workspace is not unmounted.

The lab is a public, local-file utility. It reads no account or inspection records,
requires no credentials, makes no AI calls, and does not upload the selected file.
It uses the same fixed-threshold scorer as `scripts/evaluate-vision.mjs`. It does
not run detection on photos, edit labels or claim field accuracy.

Select a labeled JSON manifest matching `docs/dominic-vision-evaluation.md`, set
confidence and intersection-over-union thresholds, and choose **Run evaluation**.
The bundled synthetic example demonstrates scoring only. Field/held-out provenance
is displayed as supplied, not independently verified. Null metrics appear as
**Not defined**, not 100%.

Hashing, parsing, scoring and export serialization run in a dedicated browser
worker. The UI displays at most 12 image rows and 12 finding types per page; the
export retains the full scored report. There is no synchronous fallback when
workers fail. A 30-second deadline stops stalled evaluations. Cancel, file/threshold
changes and leaving the page terminate outstanding work; superseded replies are
ignored. File limits and scorer work budgets reject excessive input.

The dataset/report remain in memory only. Export before closing or refreshing.
Clearing the dataset also revokes its report-download URL. Exported data can contain
sensitive identifiers and should be handled like the input. The input fingerprint
covers exact selected JSON bytes, not independent verification of referenced images.

## Validation

`node --test scripts/vision-evaluation-browser.node-test.mjs` covers browser
preparation parity, SHA-256, invalid/oversized input, incomplete labels/screening,
1,005-image pagination, error filtering and threshold validation.

The isolated CI workflow additionally runs `e2e/vision-evaluation.test.mjs` against
a production build. It exercises the actual bundled worker and download, stale
result removal, 1,005-image paging/search, 320px layout, malformed/failed input,
network mutation detection, and cancellation with a held worker. Synthetic desktop
and phone screenshots are retained in the existing browser-captures artifact.
