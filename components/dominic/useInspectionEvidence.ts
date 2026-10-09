"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { findingMediaId, isOwnedInspectionStoragePath } from "@/lib/dominicInspectionEvidence";
import { readAllReportRows, REPORT_PAGE_SIZE } from "@/lib/dominicInspectionReport";
import { abortableRequest } from "@/lib/abortableRequest";
import { reviewPage } from "@/lib/dominicFindingQueue";
import { screeningRecoveryState, type ScreeningJob } from "@/lib/dominicScreeningRecovery";

export type MediaRow = {
  id: string;
  sensor_mode: string;
  media_type: string;
  storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  captured_at: string | null;
  analysis_status: "pending" | "analyzing" | "review" | "complete" | "failed";
  analysis_summary: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type FindingRow = {
  id: string;
  finding_type: string;
  title: string;
  description: string | null;
  severity: "info" | "low" | "medium" | "high" | "critical";
  review_status: "detected" | "needs_review" | "confirmed" | "dismissed";
  confidence: number | null;
  sensor_mode: string | null;
  spatial_anchor: Record<string, unknown>;
  detector: Record<string, unknown>;
  observed_at: string;
};

export function useInspectionEvidence({ inspectionId, assetId, watchIncoming, onLoaded, onFailed }: {
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
      try {
        if (!navigator.onLine) throw new Error("Offline. Reconnect and refresh inspection evidence.");
        const sb = getSupabaseBrowser();
        const { data: session } = await sb.auth.getSession();
        const userId = session.session?.user.id;
        if (!userId) throw new Error("Sign in to refresh inspection evidence.");
        if (!current()) return;
        const [nextMedia, nextFindings, nextJobs] = await Promise.all([
          readAllReportRows<MediaRow>((after) => {
            let query = sb.from("dominic_inspection_media").select("id,sensor_mode,media_type,storage_path,original_filename,mime_type,captured_at,analysis_status,analysis_summary,metadata,created_at")
              .eq("user_id", userId).eq("inspection_id", inspectionId).eq("asset_id", assetId).order("id").limit(REPORT_PAGE_SIZE);
            if (after) query = query.gt("id", after);
            return query.abortSignal(deadline.signal);
          }, deadline.signal),
          readAllReportRows<FindingRow>((after) => {
            let query = sb.from("dominic_findings").select("id,finding_type,title,description,severity,review_status,confidence,sensor_mode,spatial_anchor,detector,observed_at")
              .eq("user_id", userId).eq("inspection_id", inspectionId).eq("asset_id", assetId).order("id").limit(REPORT_PAGE_SIZE);
            if (after) query = query.gt("id", after);
            return query.abortSignal(deadline.signal);
          }, deadline.signal),
          readAllReportRows<ScreeningJob & { id: string }>((after) => {
            let query = sb.from("dominic_media_screening_jobs").select("id:media_id,media_id,status,lease_expires_at,attempt_count,last_error")
              .eq("user_id", userId).eq("inspection_id", inspectionId).order("media_id").limit(REPORT_PAGE_SIZE);
            if (after) query = query.gt("media_id", after);
            return query.abortSignal(deadline.signal);
          }, deadline.signal),
        ]);
        if (!current()) return;
        nextMedia.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
        setMedia(nextMedia); setFindings(nextFindings);
        setScreeningJobs(Object.fromEntries(nextJobs.map((job) => [job.media_id, job])));
        setScreeningClock(Date.now()); setEvidenceLoaded(true); setEvidenceOwnerId(userId); setEvidenceError("");
        onLoaded(nextMedia);
      } catch (error) {
        if (current()) {
          setMedia([]); setFindings([]); setScreeningJobs({}); setEvidenceLoaded(false); setEvidenceOwnerId(""); setSignedUrls({});
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
  }, [inspectionId, assetId, onLoaded, onFailed]);

  useEffect(() => {
    const life = lifecycle.current;
    life.mounted = true;
    void load().catch(() => {});
    return () => { life.mounted = false; life.generation++; for (const controller of life.controllers) controller.abort(); };
  }, [load]);

  const currentMediaPage = reviewPage(media, mediaPage);
  const visibleMedia = useMemo(() => reviewPage(media, mediaPage).rows, [media, mediaPage]);
  const findingsByMedia = useMemo(() => {
    const byId = new Map<string, FindingRow[]>();
    for (const finding of findings) {
      const id = findingMediaId(finding);
      if (!id) continue;
      const rows = byId.get(id) ?? []; rows.push(finding); byId.set(id, rows);
    }
    return byId;
  }, [findings]);
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


  const hasProcessingJobs = Object.values(screeningJobs).some((job) => screeningRecoveryState(job, screeningClock).active);
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

  return { watchError, evidenceLoaded, evidenceLoading, evidenceError, media, findings, screeningJobs, screeningClock, signedUrls, currentMediaPage, visibleMedia, findingsByMedia, setMediaPage, load };
}

