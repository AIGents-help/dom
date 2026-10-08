"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { abortableRequest } from "@/lib/abortableRequest";
import { LIVE_INSPECTION_FINDING_LIMIT, liveInspectionFeed, type LiveInspectionFinding } from "@/lib/dominicLiveInspectionFeed";

type FeedState = {
  key: string;
  findings: LiveInspectionFinding[];
  total: number | null;
  error: string | null;
  refreshing: boolean;
};
const EMPTY = { findings: [], total: null, error: null, refreshing: false };

export function useLiveInspectionFindings(inspectionId?: string, assetId?: string) {
  const key = `${inspectionId ?? ""}:${assetId ?? ""}`;
  const [state, setState] = useState<FeedState>({ key, ...EMPTY });
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    if (!inspectionId || !assetId) { refreshRef.current = async () => {}; return; }
    let active = true;
    let inFlight: Promise<void> | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const run = async (): Promise<void> => {
      if (!active) return;
      if (inFlight) { await inFlight; if (active) await run(); return; }
      if (!navigator.onLine) {
        setState({ key, ...EMPTY, error: "Offline. Reconnect to refresh saved findings." });
        return;
      }
      if (document.visibilityState !== "visible") return;
      setState((current) => ({ ...(current.key === key ? current : { key, ...EMPTY }), refreshing: true }));
      const request = (async () => {
        const deadline = abortableRequest(controller.signal, 15_000);
        try {
          const sb = getSupabaseBrowser();
          const { data } = await sb.auth.getSession();
          const userId = data.session?.user.id;
          if (!userId) throw new Error("Your DOMINIC session expired. Sign in to reload saved findings.");
          if (!active || document.visibilityState !== "visible") return;
          if (!navigator.onLine) throw new Error("Offline. Reconnect to refresh saved findings.");
          const groups = await Promise.all([
            { severities: ["critical"], oldest: true },
            { severities: ["high"], oldest: true },
            { severities: ["medium", "low", "info"], oldest: false },
          ].map(async ({ severities, oldest }) => {
            const result = await sb.from("dominic_findings")
              .select("id,finding_type,title,description,severity,review_status,confidence,sensor_mode,observed_at", { count: "exact" })
              .eq("user_id", userId).eq("inspection_id", inspectionId).eq("asset_id", assetId)
              .eq("review_status", "needs_review").in("severity", severities)
              .order("observed_at", { ascending: oldest }).order("id", { ascending: true })
              .limit(LIVE_INSPECTION_FINDING_LIMIT).abortSignal(deadline.signal);
            if (result.error || result.count === null) throw new Error("Saved findings could not be refreshed. Retry when connected.");
            return { findings: (result.data ?? []) as LiveInspectionFinding[], count: result.count };
          }));
          if (active) setState({ key, ...liveInspectionFeed(groups), error: null, refreshing: false });
        } catch (error) {
          if (active) setState({ key, ...EMPTY, error: !navigator.onLine ? "Offline. Reconnect to refresh saved findings." : error instanceof Error ? error.message : "Saved findings could not be loaded." });
        } finally {
          deadline.dispose();
        }
      })();
      inFlight = request;
      await request;
      if (inFlight === request) inFlight = null;
    };
    refreshRef.current = run;
    const poll = async () => {
      await run();
      if (active) timer = setTimeout(() => void poll(), 3000);
    };
    const resume = () => { void run(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    void poll();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
    };
  }, [inspectionId, assetId, key]);

  return { ...(state.key === key ? state : { key, ...EMPTY }), refresh };
}
