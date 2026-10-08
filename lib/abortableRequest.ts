// Use AbortController directly so older controller WebViews do not need the
// newer AbortSignal.any()/timeout() static helpers.
export function abortableRequest(parent: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parent.aborted) abort();
  else parent.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => { clearTimeout(timer); parent.removeEventListener("abort", abort); controller.abort(); },
  };
}
