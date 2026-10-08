import { afterEach, describe, expect, it, vi } from "vitest";
import { abortableRequest } from "./abortableRequest";

afterEach(() => vi.useRealTimers());
describe("abortable database requests", () => {
  it("expires one request without breaking a later recovery attempt", () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const first = abortableRequest(parent.signal, 15000);
    vi.advanceTimersByTime(15000);
    expect(first.signal.aborted).toBe(true);
    expect(parent.signal.aborted).toBe(false);
    first.dispose();
    const retry = abortableRequest(parent.signal, 15000);
    expect(retry.signal.aborted).toBe(false);
    retry.dispose();
    vi.advanceTimersByTime(15000);
    expect(parent.signal.aborted).toBe(false);
    const later = abortableRequest(parent.signal, 15000);
    expect(later.signal.aborted).toBe(false); later.dispose();
  });
  it("cancels active queries when their inspection closes", () => {
    const parent = new AbortController();
    const request = abortableRequest(parent.signal, 15000);
    parent.abort(); expect(request.signal.aborted).toBe(true);
    request.dispose();
  });
  it("never starts a live query for an already closed inspection", () => {
    const parent = new AbortController(); parent.abort();
    const request = abortableRequest(parent.signal, 15000);
    expect(request.signal.aborted).toBe(true); request.dispose();
  });
});
