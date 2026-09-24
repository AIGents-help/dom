export type PixelImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray | number[];
};

export type ImageQualityAssessment = {
  width: number;
  height: number;
  megapixels: number;
  sharpnessScore: number;
  exposureScore: number;
  contrastScore: number;
  shadowClipPct: number;
  highlightClipPct: number;
  meanLuminance: number;
  usable: boolean;
  warnings: string[];
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function analyzeRgbaPixels(image: PixelImage): ImageQualityAssessment {
  const { width, height, data } = image;
  if (width < 2 || height < 2 || data.length < width * height * 4) {
    throw new Error("Image pixel buffer is invalid.");
  }

  const luminance = new Float64Array(width * height);
  let sum = 0;
  let sumSq = 0;
  let shadows = 0;
  let highlights = 0;

  for (let i = 0, p = 0; i < data.length && p < luminance.length; i += 4, p += 1) {
    const r = Number(data[i] ?? 0);
    const g = Number(data[i + 1] ?? 0);
    const b = Number(data[i + 2] ?? 0);
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luminance[p] = y;
    sum += y;
    sumSq += y * y;
    if (y <= 8) shadows += 1;
    if (y >= 247) highlights += 1;
  }

  const count = luminance.length;
  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  const stdDev = Math.sqrt(variance);
  const contrastScore = clamp01(stdDev / 64);

  let lapSum = 0;
  let lapSumSq = 0;
  let lapCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const lap =
        4 * luminance[idx] -
        luminance[idx - 1] -
        luminance[idx + 1] -
        luminance[idx - width] -
        luminance[idx + width];
      lapSum += lap;
      lapSumSq += lap * lap;
      lapCount += 1;
    }
  }
  const lapMean = lapCount ? lapSum / lapCount : 0;
  const lapVariance = lapCount
    ? Math.max(0, lapSumSq / lapCount - lapMean * lapMean)
    : 0;

  // Laplacian variance varies widely by scene. This maps useful photographic
  // texture into 0..1 without pretending to be a calibrated MTF measurement.
  const sharpnessScore = clamp01(Math.log1p(lapVariance) / Math.log(2500));
  const shadowClipPct = (shadows / count) * 100;
  const highlightClipPct = (highlights / count) * 100;

  const centerPenalty = clamp01(Math.abs(mean - 127.5) / 127.5);
  const clippingPenalty = clamp01((shadowClipPct + highlightClipPct) / 35);
  const exposureScore = clamp01(1 - centerPenalty * 0.55 - clippingPenalty * 0.7);

  const megapixels = (width * height) / 1_000_000;
  const warnings: string[] = [];
  if (sharpnessScore < 0.55) warnings.push("Image appears soft or motion-blurred.");
  if (exposureScore < 0.55) warnings.push("Exposure is outside the preferred range.");
  if (shadowClipPct > 15) warnings.push("Significant shadow clipping detected.");
  if (highlightClipPct > 15) warnings.push("Significant highlight clipping detected.");
  if (megapixels < 2) warnings.push("Image resolution is low for detailed photogrammetry.");

  return {
    width,
    height,
    megapixels,
    sharpnessScore,
    exposureScore,
    contrastScore,
    shadowClipPct,
    highlightClipPct,
    meanLuminance: mean,
    usable: sharpnessScore >= 0.45 && exposureScore >= 0.45 && megapixels >= 0.5,
    warnings,
  };
}

export async function analyzeImageFile(file: File): Promise<ImageQualityAssessment> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Select an image file.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const maxDimension = 1024;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(2, Math.round(bitmap.width * scale));
    const height = Math.max(2, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Unable to analyze image pixels.");

    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    const assessment = analyzeRgbaPixels({
      width,
      height,
      data: pixels.data,
    });

    return {
      ...assessment,
      width: bitmap.width,
      height: bitmap.height,
      megapixels: (bitmap.width * bitmap.height) / 1_000_000,
      warnings:
        bitmap.width * bitmap.height < 2_000_000
          ? Array.from(new Set([...assessment.warnings, "Image resolution is low for detailed photogrammetry."]))
          : assessment.warnings.filter((warning) => !warning.startsWith("Image resolution")),
    };
  } finally {
    bitmap.close();
  }
}


export async function analyzeImageUrl(
  url: string,
  filename = "capture-image",
): Promise<ImageQualityAssessment> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load captured image (${response.status}).`);
  }
  const blob = await response.blob();
  const file = new File([blob], filename, {
    type: blob.type || "image/jpeg",
  });
  return analyzeImageFile(file);
}
