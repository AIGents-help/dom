/** Offline, fixed-threshold localization scoring. Never calls a model or changes findings. */
export const VISION_EVALUATION_LIMITS = Object.freeze({
  images: 10_000, itemsPerImage: 100, totalItems: 100_000, matchingPairs: 5_000_000,
});

/** @param {unknown} value @param {string} path @returns {Record<string, unknown>} */
function object(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return /** @type {Record<string, unknown>} */ (value);
}
/** @param {unknown} value @param {string} path @param {number} maximum */
function list(value, path, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`${path} must be an array with at most ${maximum} items.`);
  }
  return /** @type {unknown[]} */ (value);
}
/** @param {unknown} value @param {string} path */
function text(value, path) {
  if (typeof value !== "string" || !value.trim() || value.length > 200 || value !== value.trim()) {
    throw new Error(`${path} must be a nonblank, trimmed string of at most 200 characters.`);
  }
  return value;
}
/** @param {unknown} value @param {string} path @param {boolean} [positive] */
function unit(value, path, positive = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value > 1 ||
    value < 0 || (positive && value === 0)) {
    throw new Error(`${path} must be a finite number ${positive ? "above 0 and" : "between 0 and"} at most 1.`);
  }
  return value;
}
/** @param {unknown} value @param {string} path */
function findingType(value, path) {
  const result = text(value, path);
  if (!/^[a-z][a-z0-9_]{0,79}$/.test(result)) {
    throw new Error(`${path} must use the canonical lowercase finding_type (letters, digits, underscores).`);
  }
  return result;
}
/** @typedef {{x: number, y: number, width: number, height: number}} VisionEvaluationRegion */
/** @param {unknown} value @param {string} path @returns {VisionEvaluationRegion} */
function region(value, path) {
  const box = object(value, path);
  const result = {
    x: unit(box.x, `${path}.x`), y: unit(box.y, `${path}.y`),
    width: unit(box.width, `${path}.width`, true), height: unit(box.height, `${path}.height`, true),
  };
  if (result.x + result.width > 1 + 1e-9 || result.y + result.height > 1 + 1e-9) {
    throw new Error(`${path} extends outside its normalized image.`);
  }
  return result;
}
/** @param {VisionEvaluationRegion} a @param {VisionEvaluationRegion} b */
export function visionRegionIoU(a, b) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = width * height;
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? Math.max(0, Math.min(1, intersection / union)) : 0;
}

/** Validate every image before scoring; never silently skip missing labels or failed screenings.
 * @param {unknown} input
 */
function validateDataset(input) {
  const root = object(input, "dataset file");
  if (root.schema_version !== 1) throw new Error("schema_version must be 1.");
  const dataset = object(root.dataset, "dataset");
  const run = object(root.run, "run");
  if (dataset.source !== "synthetic" && dataset.source !== "field") {
    throw new Error("dataset.source must be synthetic or field.");
  }
  if (dataset.split !== "development" && dataset.split !== "held_out") {
    throw new Error("dataset.split must be development or held_out.");
  }
  const metadata = {
    id: text(dataset.id, "dataset.id"), revision: text(dataset.revision, "dataset.revision"),
    source: String(dataset.source), split: String(dataset.split), labeler: text(dataset.labeler, "dataset.labeler"),
  };
  const runMetadata = {
    id: text(run.id, "run.id"), model: text(run.model, "run.model"),
    prompt_revision: text(run.prompt_revision, "run.prompt_revision"),
  };
  const rows = list(root.samples, "samples", VISION_EVALUATION_LIMITS.images);
  if (!rows.length) throw new Error("At least one completely labeled, screened image is required.");
  const imageIds = new Set();
  const hashes = new Set();
  let totalItems = 0;
  let matchingPairs = 0;
  const samples = rows.map((row, index) => {
    const path = `samples[${index}]`;
    const sample = object(row, path);
    const id = text(sample.id, `${path}.id`);
    const captureGroup = text(sample.capture_group, `${path}.capture_group`);
    const hash = text(sample.media_sha256, `${path}.media_sha256`);
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error(`${path}.media_sha256 must be 64 lowercase hexadecimal characters.`);
    if (imageIds.has(id) || hashes.has(hash)) throw new Error(`${path} repeats an image ID or image hash; duplicate images cannot inflate scores.`);
    imageIds.add(id);
    hashes.add(hash);
    if (sample.annotation_complete !== true) throw new Error(`${path}.annotation_complete must be explicitly true, including clean images.`);
    const screening = object(sample.screening, `${path}.screening`);
    if (screening.status !== "completed") {
      throw new Error(`${path}.screening.status must be completed; failed, pending or missing work cannot count as a clean result.`);
    }
    const truthIds = new Set();
    const truths = list(sample.ground_truth, `${path}.ground_truth`, VISION_EVALUATION_LIMITS.itemsPerImage).map((item, i) => {
      const labelPath = `${path}.ground_truth[${i}]`;
      const label = object(item, labelPath);
      const labelId = text(label.id, `${labelPath}.id`);
      if (truthIds.has(labelId)) throw new Error(`${labelPath}.id is duplicated within this image.`);
      truthIds.add(labelId);
      return {
        id: labelId, finding_type: findingType(label.finding_type, `${labelPath}.finding_type`),
        region: region(label.region, `${labelPath}.region`),
      };
    });
    // Accept DOMINIC's recorded candidates directly. Do not use its permissive parser here:
    // coercing, truncating or dropping bad predictions would change the measured result.
    const predictions = list(screening.candidates, `${path}.screening.candidates`, VISION_EVALUATION_LIMITS.itemsPerImage).map((item, i) => {
      const candidatePath = `${path}.screening.candidates[${i}]`;
      const candidate = object(item, candidatePath);
      return {
        index: i, finding_type: findingType(candidate.finding_type, `${candidatePath}.finding_type`),
        confidence: unit(candidate.confidence, `${candidatePath}.confidence`),
        region: candidate.region === null ? null : region(candidate.region, `${candidatePath}.region`),
      };
    });
    totalItems += truths.length + predictions.length;
    matchingPairs += truths.length * predictions.length;
    if (totalItems > VISION_EVALUATION_LIMITS.totalItems || matchingPairs > VISION_EVALUATION_LIMITS.matchingPairs) {
      throw new Error("Dataset exceeds the bounded evaluation work budget; evaluate smaller, documented partitions.");
    }
    return { id, capture_group: captureGroup, media_sha256: hash, truths, predictions };
  });
  return { dataset: metadata, run: runMetadata, samples };
}

function counts() { return { true_positives: 0, false_positives: 0, false_negatives: 0 }; }
/** @param {number} numerator @param {number} denominator */
function divide(numerator, denominator) { return denominator === 0 ? null : numerator / denominator; }
/** @param {ReturnType<typeof counts>} count */
function scored(count) {
  const { true_positives: tp, false_positives: fp, false_negatives: fn } = count;
  return { ...count, precision: divide(tp, tp + fp), recall: divide(tp, tp + fn), f1: divide(2 * tp, 2 * tp + fp + fn) };
}

/** Fixed-threshold, confidence-ordered, one-to-one matching within the same image and type.
 * @param {unknown} input
 * @param {{confidenceThreshold?: number, iouThreshold?: number}} [options]
 */
export function evaluateDominicVision(input, options = {}) {
  const confidenceThreshold = unit(options.confidenceThreshold === undefined ? 0.5 : options.confidenceThreshold, "confidenceThreshold");
  const iouThreshold = unit(options.iouThreshold === undefined ? 0.5 : options.iouThreshold, "iouThreshold", true);
  const data = validateDataset(input);
  const totals = counts();
  /** @type {Map<string, ReturnType<typeof counts>>} */
  const classes = new Map();
  /** @param {string} type */
  const bucket = (type) => {
    if (!classes.has(type)) classes.set(type, counts());
    return /** @type {ReturnType<typeof counts>} */ (classes.get(type));
  };
  let excludedPredictions = 0;
  let unlocalizedPredictions = 0;
  let negativeImages = 0;
  let negativeImagesWithPredictions = 0;
  const samples = data.samples.map((sample) => {
    const used = new Set();
    const matches = [];
    const falsePositives = [];
    const active = sample.predictions.filter((candidate) => candidate.confidence >= confidenceThreshold)
      .sort((a, b) => b.confidence - a.confidence || a.index - b.index);
    excludedPredictions += sample.predictions.length - active.length;
    if (!sample.truths.length) {
      negativeImages++;
      if (active.length) negativeImagesWithPredictions++;
    }
    for (const truth of sample.truths) bucket(truth.finding_type);
    for (const candidate of active) {
      let bestIndex = -1;
      let bestIoU = -1;
      let overlapsUsedTruth = false;
      for (let i = 0; i < sample.truths.length; i++) {
        const truth = sample.truths[i];
        if (!candidate.region || truth.finding_type !== candidate.finding_type) continue;
        const overlap = visionRegionIoU(candidate.region, truth.region);
        if (overlap < iouThreshold) continue;
        if (used.has(i)) { overlapsUsedTruth = true; continue; }
        if (overlap > bestIoU) { bestIoU = overlap; bestIndex = i; }
      }
      if (bestIndex >= 0) {
        used.add(bestIndex);
        totals.true_positives++;
        bucket(candidate.finding_type).true_positives++;
        matches.push({ prediction_index: candidate.index, ground_truth_id: sample.truths[bestIndex].id, iou: bestIoU });
      } else {
        totals.false_positives++;
        bucket(candidate.finding_type).false_positives++;
        if (!candidate.region) unlocalizedPredictions++;
        falsePositives.push({ prediction_index: candidate.index,
          reason: !candidate.region ? "unlocalized" : overlapsUsedTruth ? "duplicate" : "no_same_type_overlap" });
      }
    }
    const missed = sample.truths.filter((_, index) => !used.has(index));
    totals.false_negatives += missed.length;
    for (const truth of missed) bucket(truth.finding_type).false_negatives++;
    return {
      id: sample.id, capture_group: sample.capture_group, media_sha256: sample.media_sha256,
      ground_truth_count: sample.truths.length, prediction_count: sample.predictions.length,
      evaluated_prediction_count: active.length, matches, false_positives: falsePositives,
      missed_ground_truth_ids: missed.map((truth) => truth.id),
    };
  });
  return {
    schema_version: 1, evaluation: "localized_detection_fixed_threshold",
    dataset: data.dataset, run: data.run,
    thresholds: { confidence: confidenceThreshold, iou: iouThreshold },
    image_count: samples.length, capture_group_count: new Set(samples.map((sample) => sample.capture_group)).size,
    metrics: scored(totals), excluded_prediction_count: excludedPredictions,
    unlocalized_prediction_count: unlocalizedPredictions,
    clean_images: { count: negativeImages, with_predictions: negativeImagesWithPredictions,
      false_alarm_image_rate: divide(negativeImagesWithPredictions, negativeImages) },
    per_type: [...classes.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([finding_type, value]) => ({ finding_type, ...scored(value) })),
    samples,
    limitations: [
      "Scores compare supplied annotations with recorded candidates; annotation quality and completeness are not independently verified.",
      "Synthetic data validates scoring behavior, not industrial detection accuracy. Field/held-out provenance is supplied, not attested by this tool.",
      "These are fixed-threshold localization metrics, not mAP, tracking accuracy, engineering diagnosis, hardware validation or release approval.",
      "A null candidate region is an unmatched localization prediction; it does not by itself prove that the visible anomaly is false.",
      "Repeated frames from a capture group are not independent trials. Held-out splits must separate sites/assets/capture sessions from tuning data.",
    ],
  };
}
