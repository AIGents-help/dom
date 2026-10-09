"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { isOwnedInspectionStoragePath } from "@/lib/dominicInspectionEvidence";
import { abortableRequest } from "@/lib/abortableRequest";
import { type ScreeningJob } from "@/lib/dominicScreeningRecovery";

import type { FindingRow, MediaRow, InspectionReviewPage } from "@/lib/dominicInspectionReview";
import type { FindingReviewFilter } from "@/lib/dominicFindingQueue";
export type { FindingRow, MediaRow } from "@/lib/dominicInspectionReview";

export function useInspectionEvidence({ inspectionId, watchIncoming, onLoaded, onFailed }: {
  inspectionId: string; assetId: string; watchIncoming: boolean;
  onLoaded: (media: MediaRow[]) => void; onFailed: () => void;
}) {
  const [watchError, setWatchError] = useState("");
  const urlCache = useRef(new Map<string, { url: string; expires: number }>());
  const [evidenceLoaded, setEvidenceLoaded] = useState(false);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceOwnerId, setEvidenceOwnerId] = useState("");
  const [mediaPage, setMediaPage] = useState(0);
  const [findingPage, setFindingPage] = useState(0);
  const [findingFilter, setFindingFilter] = useState<FindingReviewFilter>("all");
  const [findingSearch, setFindingSearch] = useState("");
  const [pageData, setPageData] = useState<InspectionReviewPage | null>(null);
  const lastQuery = useRef("");
  const loadChain = useRef<Promise<void>>(Promise.resolve());
  const lifecycle = useRef({ generation: 0, mounted: true, controllers: new Set<AbortController>() });
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [screeningJobs, setScreeningJobs] = useState<Record<string, ScreeningJob>>({});
  const [screeningClock, setScreeningClock] = useState(() => Date.now());
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const life = lifecycle.current;
    const generation = life.generation;
    const current = () => life.mounted && generation === life.generation;
    const task = loadChain.current.catch(() => {}).then(async () => {
      if (!current()) return;
      const controller = new AbortController();
      life.controllers.add(controller);
      const deadline = abortableRequest(controller.signal, 30_000);
      setEvidenceLoading(true);
      const queryKey = JSON.stringify([mediaPage, findingPage, findingFilter, findingSearch]);
      if (lastQuery.current !== queryKey) {
        lastQuery.current = queryKey;
        setEvidenceLoaded(false); setMedia([]); setFindings([]); setPageData(null); setSignedUrls({});
      }
      try {
        if (!navigator.onLine) throw new Error("Offline. Reconnect and refresh inspection evidence.");
        const sb = getSupabaseBrowser();
        const { data: session } = await sb.auth.getSession();
        const userId = session.session?.user.id;
        if (!userId) throw new Error("Sign in to refresh inspection evidence.");
        if (!current()) return;
        const params = new URLSearchParams({ mediaPage: String(mediaPage), findingPage: String(findingPage), filter: findingFilter, search: findingSearch });
        const response = await fetch(`/api/dominic/inspections/${inspectionId}/review?${params}`, {
          headers: { Authorization: `Bearer ${session.session?.access_token}` }, cache: "no-store", signal: deadline.signal,
        });
        const next: InspectionReviewPage & { error?: string } = await response.json();
        if (!response.ok) throw new Error(next.error ?? "Inspection evidence could not be refreshed.");
        if (!current()) return;
        setMedia(next.media); setFindings(next.findings); setPageData(next);
        setScreeningJobs(Object.fromEntries(next.jobs.map((job) => [job.media_id, job])));
        setScreeningClock(Date.now()); setEvidenceLoaded(true); setEvidenceOwnerId(userId); setEvidenceError("");
        onLoaded(next.media);
      } catch (error) {
        if (current()) {
          setMedia([]); setFindings([]); setPageData(null); setScreeningJobs({}); setEvidenceLoaded(false); setEvidenceOwnerId(""); setSignedUrls({});
          onFailed();
          setEvidenceError(error instanceof Error ? error.message : "Inspection evidence could not be refreshed. Retry before reviewing.");
        }
        throw error;
      } finally {
        deadline.dispose(); life.controllers.delete(controller);
        if (current()) setEvidenceLoading(false);
      }
    });
    loadChain.current = task;
    await task;
  }, [inspectionId, onLoaded, onFailed, mediaPage, findingPage, findingFilter, findingSearch]);

  useEffect(() => {
    const life = lifecycle.current;
    life.mounted = true;
    void load().catch(() => {});
    return () => { life.mounted = false; life.generation++; for (const controller of life.controllers) controller.abort(); };
  }, [load]);

  const mediaTotal = pageData?.mediaTotal ?? 0;
  const currentMediaPage = { page: pageData?.mediaPage ?? mediaPage, last: Math.max(0, Math.ceil(mediaTotal / 12) - 1), start: (pageData?.mediaPage ?? mediaPage) * 12, rows: media };
  const visibleMedia = media;
  const findingsByMedia = useMemo(() => new Map((pageData?.linkedFindings ?? []).map((row) => [row.media_id, row.findings])), [pageData]);
  const findingCountsByMedia = useMemo(() => new Map((pageData?.linkedFindings ?? []).map((row) => [row.media_id, row.total])), [pageData]);
  useEffect(() => {
    let active = true;
    const sb = getSupabaseBrowser();
    void (async () => {
      const entries: Array<readonly [string, string]> = [];
      for (let start = 0; active && start < visibleMedia.length; start += 4) {
        entries.push(...await Promise.all(visibleMedia.slice(start, start + 4).map(async (item) => {
          if (!isOwnedInspectionStoragePath(item.storage_path, evidenceOwnerId) || !evidenceOwnerId) return [item.id, ""] as const;
          const cached = urlCache.current.get(item.storage_path);
          if (cached && cached.expires > Date.now()) return [item.id, cached.url] as const;
          const { data } = await sb.storage.from("dominic-inspection-evidence").createSignedUrl(item.storage_path, 900);
          if (data?.signedUrl) urlCache.current.set(item.storage_path, { url: data.signedUrl, expires: Date.now() + 600_000 });
          return [item.id, data?.signedUrl ?? ""] as const;
        })));
      }
      if (active) setSignedUrls(Object.fromEntries(entries.filter(([, url]) => Boolean(url))));
    })().catch(() => { if (active) setSignedUrls({}); });
    return () => { active = false; };
  }, [visibleMedia, evidenceOwnerId]);


  const hasProcessingJobs = pageData?.hasProcessingJobs ?? false;
  useEffect(() => {
    if (!watchIncoming && !hasProcessingJobs) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!active) return;
      if (document.visibilityState === "visible" && navigator.onLine) {
        try { await load(); if (active) setWatchError(""); }
        catch { if (active) setWatchError("Incoming evidence refresh failed. Reconnect to resume updates."); }
      }
      if (active) timer = setTimeout(() => void poll(), 3000);
    };
    timer = setTimeout(() => void poll(), 3000);
    return () => { active = false; clearTimeout(timer); };
  }, [load, watchIncoming, hasProcessingJobs]);

  const changeFindingQuery = useCallback((filter: FindingReviewFilter, search: string) => { setFindingFilter(filter); setFindingSearch(search); setFindingPage(0); }, []);
  return { watchError, evidenceLoaded, evidenceLoading, evidenceError, media, findings, screeningJobs, screeningClock, signedUrls, currentMediaPage, visibleMedia, findingsByMedia, findingCountsByMedia, setMediaPage, load,
    mediaTotal, findingTotal: pageData?.findingTotal ?? 0, matchingTotal: pageData?.matchingTotal ?? 0,
    needsReview: pageData?.needsReview ?? 0, confirmedTotal: pageData?.confirmedTotal ?? 0,
    copilotFindings: pageData?.copilotFindings ?? [], copilotMedia: pageData?.copilotMedia ?? [], currentFindingPage: pageData?.findingPage ?? findingPage,
    findingFilter, findingSearch, setFindingPage,
    changeFindingQuery,
  };
}

