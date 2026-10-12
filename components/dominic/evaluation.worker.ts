import { prepareBrowserVisionEvaluation } from "../../lib/dominicVisionEvaluationBrowser.mjs";

self.onmessage = async (event: MessageEvent<{
  file: Blob;
  options: { confidenceThreshold: number; iouThreshold: number };
}>) => {
  try {
    const result = await prepareBrowserVisionEvaluation(event.data.file, event.data.options);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : "Evaluation failed." });
  }
};
