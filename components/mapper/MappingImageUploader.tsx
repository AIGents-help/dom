"use client";

import { useCallback, useRef, useState } from "react";
import * as tus from "tus-js-client";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { V, panelStyle, btnGhost } from "./theme";
import { formatBytes } from "@/lib/mapperPipeline";

// Direct-to-storage upload using Supabase's resumable (TUS) protocol —
// verified against the official docs before implementing (chunkSize MUST
// be 6MB per Supabase's own docs; this is not a tunable we invented).
// Image bytes never pass through a Vercel function body: only the
// project-scoped object PATH is requested from our API
// (POST /api/pilot/mapping/projects/[id]/upload-url), then the browser
// uploads straight to `https://<project-ref>.storage.supabase.co` using the
// pilot's own session — authorized by the folder-scoped RLS policy on the
// mapping-uploads bucket, plus the server-issued single-use signed token as
// a second, defense-in-depth layer (`x-signature`).
//
// Metadata extracted here (file size/type/checksum/pixel dimensions) is
// explicitly NOT treated as geospatial-authoritative — camera/GPS fields
// are left null until the worker's server-side EXIF pass fills them in.

const CHUNK_SIZE = 6 * 1024 * 1024; // required by Supabase's resumable upload protocol — do not change
const MAX_CONCURRENT_UPLOADS = 3;
const BATCH_SIZE = 100; // upload-url route caps at 200/call; keep well under it

type FileStatus = "pending" | "checksumming" | "queued" | "uploading" | "confirming" | "done" | "duplicate" | "error";

interface TrackedFile {
  clientId: string;
  file: File;
  status: FileStatus;
  progress: number; // 0-100
  checksum: string | null;
  path: string | null;
  token: string | null;
  error: string | null;
}

function projectRefFromSupabaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const match = url?.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  return match ? match[1] : null;
}

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function imageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) return resolve(null);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

export default function MappingImageUploader({
  accessToken,
  projectId,
  disabled,
  onUploaded,
}: {
  accessToken: string;
  projectId: string;
  disabled?: boolean;
  onUploaded: () => void;
}) {
  const [files, setFiles] = useState<TrackedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadsInFlight = useRef(0);

  const updateFile = useCallback((clientId: string, patch: Partial<TrackedFile>) => {
    setFiles((prev) => prev.map((f) => (f.clientId === clientId ? { ...f, ...patch } : f)));
  }, []);

  const runUpload = useCallback(
    async (tracked: TrackedFile) => {
      const projectRef = projectRefFromSupabaseUrl();
      if (!projectRef || !tracked.path || !tracked.token) {
        updateFile(tracked.clientId, { status: "error", error: "Upload could not be authorized." });
        return;
      }
      const sb = getSupabaseBrowser();
      const { data: sessionData } = await sb.auth.getSession();
      const accessTok = sessionData.session?.access_token ?? accessToken;

      updateFile(tracked.clientId, { status: "uploading", progress: 0 });

      await new Promise<void>((resolve) => {
        const upload = new tus.Upload(tracked.file, {
          endpoint: `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`,
          retryDelays: [0, 1000, 3000, 5000, 10000],
          headers: {
            authorization: `Bearer ${accessTok}`,
            "x-upsert": "true",
            "x-signature": tracked.token!,
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: "mapping-uploads",
            objectName: tracked.path!,
            contentType: tracked.file.type || "application/octet-stream",
            cacheControl: "3600",
          },
          chunkSize: CHUNK_SIZE,
          onError: (err) => {
            updateFile(tracked.clientId, { status: "error", error: err.message ?? "Upload failed." });
            resolve();
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            updateFile(tracked.clientId, { progress: Math.round((bytesUploaded / bytesTotal) * 100) });
          },
          onSuccess: async () => {
            updateFile(tracked.clientId, { status: "confirming", progress: 100 });
            const dims = await imageDimensions(tracked.file);
            const res = await fetch(`/api/pilot/mapping/projects/${projectId}/images`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
              body: JSON.stringify({
                storage_path: tracked.path,
                original_filename: tracked.file.name,
                file_size: tracked.file.size,
                mime_type: tracked.file.type || null,
                checksum: tracked.checksum,
                image_width: dims?.width ?? null,
                image_height: dims?.height ?? null,
              }),
            });
            if (res.status === 409) {
              updateFile(tracked.clientId, { status: "duplicate", error: "Already uploaded to this project." });
            } else if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              updateFile(tracked.clientId, { status: "error", error: body.error ?? "Could not record this upload." });
            } else {
              updateFile(tracked.clientId, { status: "done" });
              onUploaded();
            }
            resolve();
          },
        });

        upload.findPreviousUploads().then((previous) => {
          if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
          upload.start();
        });
      });
    },
    [accessToken, projectId, updateFile, onUploaded]
  );

  const drainQueue = useCallback(
    (queue: TrackedFile[]) => {
      const pump = () => {
        while (uploadsInFlight.current < MAX_CONCURRENT_UPLOADS && queue.length > 0) {
          const next = queue.shift();
          if (!next) break;
          uploadsInFlight.current += 1;
          runUpload(next).finally(() => {
            uploadsInFlight.current -= 1;
            pump();
          });
        }
      };
      pump();
    },
    [runUpload]
  );

  const addFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
      if (incoming.length === 0) return;

      const tracked: TrackedFile[] = incoming.map((file) => ({
        clientId: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        status: "pending",
        progress: 0,
        checksum: null,
        path: null,
        token: null,
        error: null,
      }));
      setFiles((prev) => [...prev, ...tracked]);

      // Checksum client-side (for same-batch dedup and to send to the
      // server, which enforces the real duplicate check via a DB unique
      // index) — not treated as authoritative for anything beyond dedup.
      for (const t of tracked) {
        updateFile(t.clientId, { status: "checksumming" });
        const checksum = await sha256Hex(t.file);
        t.checksum = checksum; // updateFile only patches React state, not this local object — the dedup filter below reads t.checksum directly
        updateFile(t.clientId, { checksum });
      }

      const seen = new Set<string>();
      const deduped = tracked.filter((t) => {
        const cs = t.checksum!;
        if (seen.has(cs)) { updateFile(t.clientId, { status: "duplicate", error: "Duplicate of another file in this batch." }); return false; }
        seen.add(cs);
        return true;
      });

      for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
        const batch = deduped.slice(i, i + BATCH_SIZE);
        batch.forEach((t) => updateFile(t.clientId, { status: "queued" }));
        const res = await fetch(`/api/pilot/mapping/projects/${projectId}/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ filenames: batch.map((t) => t.file.name) }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          batch.forEach((t) => updateFile(t.clientId, { status: "error", error: body.error ?? "Could not start upload." }));
          continue;
        }
        const uploads: { filename: string; path?: string; token?: string; error?: string }[] = body.uploads ?? [];
        const ready: TrackedFile[] = [];
        batch.forEach((t, idx) => {
          const result = uploads[idx];
          if (!result || result.error || !result.path || !result.token) {
            updateFile(t.clientId, { status: "error", error: result?.error ?? "Could not authorize upload." });
            return;
          }
          const withPath = { ...t, path: result.path, token: result.token };
          ready.push(withPath);
          updateFile(t.clientId, { path: result.path, token: result.token });
        });
        drainQueue(ready);
      }
    },
    [accessToken, projectId, updateFile, drainQueue]
  );

  function retry(clientId: string) {
    const target = files.find((f) => f.clientId === clientId);
    if (!target) return;
    updateFile(clientId, { status: "queued", error: null, progress: 0 });
    drainQueue([target]);
  }

  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const duplicateCount = files.filter((f) => f.status === "duplicate").length;
  const inProgressCount = files.length - doneCount - errorCount - duplicateCount;

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (!disabled) addFiles(e.dataTransfer.files);
        }}
        style={{
          ...panelStyle,
          borderStyle: "dashed",
          borderColor: dragActive ? V.signal : V.line,
          textAlign: "center",
          padding: 32,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <p style={{ color: V.ink, fontSize: 14, fontWeight: 600 }}>Drag & drop imagery here, or click to select</p>
        <p style={{ color: V.inkFaint, fontSize: 12, marginTop: 6 }}>Supports large batches (hundreds of images). Duplicates are detected automatically.</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          disabled={disabled}
          style={{ display: "none" }}
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {files.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="font-mono-ibm" style={{ display: "flex", gap: 16, fontSize: 11, color: V.inkFaint, marginBottom: 10 }}>
            <span>{files.length} files</span>
            <span style={{ color: V.telemetry }}>{doneCount} done</span>
            {inProgressCount > 0 && <span style={{ color: V.signal }}>{inProgressCount} in progress</span>}
            {duplicateCount > 0 && <span>{duplicateCount} duplicate</span>}
            {errorCount > 0 && <span style={{ color: V.danger }}>{errorCount} failed</span>}
          </div>

          <div style={{ maxHeight: 260, overflowY: "auto", display: "grid", gap: 6 }}>
            {files.map((f) => (
              <div key={f.clientId} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, padding: "6px 0", borderBottom: `1px solid ${V.lineSoft}` }}>
                <span style={{ flex: 1, color: V.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.file.name}</span>
                <span style={{ color: V.inkFaint, width: 70, textAlign: "right" }}>{formatBytes(f.file.size)}</span>
                <span style={{ width: 110, textAlign: "right" }}>
                  {f.status === "uploading" || f.status === "confirming" ? (
                    <span style={{ color: V.signal }}>{f.progress}%</span>
                  ) : f.status === "done" ? (
                    <span style={{ color: V.telemetry }}>Done</span>
                  ) : f.status === "duplicate" ? (
                    <span style={{ color: V.inkFaint }}>Duplicate</span>
                  ) : f.status === "error" ? (
                    <span style={{ color: V.danger }} title={f.error ?? undefined}>Failed</span>
                  ) : (
                    <span style={{ color: V.inkFaint, textTransform: "capitalize" }}>{f.status}</span>
                  )}
                </span>
                {f.status === "error" && (
                  <button onClick={() => retry(f.clientId)} style={{ ...btnGhost, padding: "3px 9px", fontSize: 11 }}>Retry</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
