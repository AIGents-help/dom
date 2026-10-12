# DOMINIC recorded-image accuracy evaluation

This offline tool compares recorded DOMINIC candidates with a completely labeled
image dataset. It reports fixed-threshold **localization precision and recall**,
missed annotations, unmatched predictions, duplicate detections, per-type totals
and the fraction of clean images that generated candidates.

It does not call an AI provider, fetch images, change a saved finding, control an
aircraft or establish industrial accuracy without suitable independently labeled
field data. It does not implement continuous-video tracking. The supplied example
is synthetic scoring data, not an industrial accuracy benchmark.

## Run

Requires Node.js 22. No dependency installation or credentials are needed.

```sh
node scripts/evaluate-vision.mjs examples/dominic-vision-evaluation.synthetic.json
node scripts/evaluate-vision.mjs /private/field-set.json --confidence 0.6 --iou 0.5 --output /private/field-report.json
node --test scripts/vision-evaluation.node-test.mjs
```

The existing `npm run test:deployment` glob includes these regression tests, so
`npm run verify` runs them automatically. JSON is written to stdout when no output
path is given. A named output file is created with owner-only permissions and must
not already exist. Invalid input returns a nonzero exit code and no scored report.
Input files are limited to 16 MiB. Evaluation is bounded to 10,000 images, 100
annotations and 100 predictions per image, 100,000 combined items and 5,000,000
candidate/annotation comparisons. Oversized input fails; it is never truncated.

## Input contract

Root fields are `schema_version: 1`, `dataset`, `run`, and `samples`.

`dataset` requires an ID, revision, source (`synthetic` or `field`), split
(`development` or `held_out`), and labeler identifier. `run` requires an ID,
recorded model identifier and prompt revision. These describe the original run;
the tool neither selects nor executes that model.

Each sample requires:

- `id`, `capture_group`, and lowercase `media_sha256`: identify the original image
  and its capture session. For field data, hash the exact original image bytes.
  Repeated IDs or image hashes are rejected. Related but nonidentical video frames
  may remain correlated; a hash cannot detect near-duplicates.
- `annotation_complete: true` and an explicit `ground_truth` array. Each annotation
  needs a unique ID within its image, canonical `finding_type`, and region. Empty
  ground truth means a human has reviewed the image completely and found no target
  conditions; it must never mean that the image has not been labeled.
- `screening: {status: "completed", candidates: [...]}`. Copy candidates from the
  saved DOMINIC screening result. The scorer reads `finding_type`, `confidence`
  and `region`; other DOMINIC candidate fields are not needed. A failed, pending or
  missing screening blocks the whole report instead of silently becoming empty.

Regions use full-image normalized `x`, `y`, `width`, `height` in 0..1, with
positive dimensions and no extension outside the image (apart from a 1e-9
floating-point tolerance). Ground truth cannot use null regions. A candidate may
have `region: null`; it is retained as an explicitly unlocalized prediction.
Missing regions, malformed candidates and out-of-range confidence are rejected,
not repaired or silently discarded. Labels and candidates must use exactly the
same lowercase `finding_type` taxonomy.

## Scoring definition

Confidence defaults to 0.5 and is inclusive. IoU defaults to 0.5 and must be greater
than zero. Intersection over union is overlap area divided by union area.

Within each image, retained predictions are processed by descending confidence;
input index breaks confidence ties. A prediction matches the unused annotation
of the same type with the greatest IoU at or above the threshold. Annotation input
order breaks IoU ties. Each prediction and annotation may be used at most once.
No matching occurs across images or types. This is greedy confidence-ordered
matching, not maximum-cardinality matching or COCO mAP.

Matched predictions are true positives (TP). Unmatched predictions are false
positives (FP) **for localization scoring**, including duplicates and unlocalized
candidates. Remaining annotations are false negatives (FN). A null region is not
proof of a false visible condition: consult `unlocalized_prediction_count` and the
per-image reason before interpreting unmatched predictions as false alarms.

Precision = TP / (TP + FP). Recall = TP / (TP + FN).
F1 = 2*TP / (2*TP + FP + FN). A zero denominator is JSON `null`, not a fabricated
100% score. Lower-confidence predictions are counted as excluded, but all ground
truth remains in the recall denominator. Per-type scores follow the same rules.
The clean-image false-alarm rate is the number of completely annotated clean
images with at least one retained candidate divided by the number of clean images.
The report includes the exact input-file SHA-256 for reproducibility.

## Field evaluation procedure and limits

Collect authorized representative inspection imagery, including clean surfaces,
small visible defects, shadows, glare, motion blur and viewpoint changes. Have a
qualified reviewer label the complete target taxonomy before looking at model
predictions. Record the dataset revision, labeler, capture grouping and exact model
and prompt revision. Do not publish confidential refinery images or evaluation
files into the public repository.

Tune thresholds on development data, then freeze them before using a held-out set.
Keep capture sessions, assets and sites separated from tuning data as appropriate;
nearby frames are not independent evidence. `held_out` and `field` are user-supplied
provenance, not proof that these procedures were followed. Inspect per-type errors
and missed-label IDs rather than quoting only one aggregate percentage.

The tool does not measure tracking identity, temperature, leaks, severity,
engineering diagnoses, aircraft safety, latency, uncertainty bounds or model
confidence calibration. It does not approve a release. Provider failures must be
resolved and all expected images included before scoring; the tool cannot detect
images omitted entirely from the supplied manifest. Field validation remains open.
