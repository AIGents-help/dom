"use client";

import { useEffect, useState } from "react";

/**
 * Returns a stable clock value during each render and refreshes it on an
 * interval. This keeps time-based UI deterministic without freezing
 * countdowns for users who leave an operations screen open.
 */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}
