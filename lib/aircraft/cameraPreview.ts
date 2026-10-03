import type { UniversalCameraPreviewFrame } from "./contract";

export const MAX_PREVIEW_BASE64_LENGTH = 400_000;
export const PREVIEW_STALE_MS = 5000;
export function isCameraPreviewFrame(value: unknown): value is UniversalCameraPreviewFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as UniversalCameraPreviewFrame;
  if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 1 || frame.height < 1 || frame.width > 4096 || frame.height > 4096) return false;
  if (typeof frame.jpegBase64 !== "string" || frame.jpegBase64.length > MAX_PREVIEW_BASE64_LENGTH || !/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(frame.jpegBase64) || frame.jpegBase64.length % 4 !== 0) return false;
  const capture = frame.capture;
  if (!capture?.previewFrame || capture.previewFrame.width !== frame.width || capture.previewFrame.height !== frame.height || typeof capture.previewFrame.telemetryAvailable !== "boolean") return false;
  if (!capture || typeof capture.id !== "string" || !capture.id || capture.id.length > 160 || typeof capture.aircraftId !== "string" || !capture.aircraftId || capture.aircraftId.length > 160 || capture.mimeType !== "image/jpeg") return false;
  if (![capture.capturedAtMs, capture.latitude, capture.longitude, capture.relativeAltitudeFt, capture.headingDeg, capture.gimbalPitchDeg].every((number) => typeof number === "number" && Number.isFinite(number))) return false;
  return capture.capturedAtMs > 0 && Math.abs(capture.latitude) <= 90 && Math.abs(capture.longitude) <= 180 && (capture.cameraSource === undefined || capture.cameraSource === "wide" || capture.cameraSource === "zoom");
}
export function previewImageUrl(frame: UniversalCameraPreviewFrame) {
  return `data:image/jpeg;base64,${frame.jpegBase64}`;
}
export function previewFrameFile(frame: UniversalCameraPreviewFrame): File {
  if (!isCameraPreviewFrame(frame)) throw new Error("Invalid camera preview frame.");
  const bytes = Uint8Array.from(atob(frame.jpegBase64), (char) => char.charCodeAt(0));
  return new File([bytes], `preview-${frame.capture.id.replace(/[^a-zA-Z0-9_-]/g, "-")}.jpg`, { type: "image/jpeg", lastModified: frame.capture.capturedAtMs });
}
