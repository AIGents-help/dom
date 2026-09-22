"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ImageIcon } from "lucide-react";
import { formatBytes } from "@/lib/mapperPipeline";
import type { MappingImage } from "./types";
import { V, btnGhost } from "./theme";

const LABELS: Record<string, string> = {
  stored: "Stored",
  downloading: "Downloading to worker",
  downloaded: "Downloaded",
  metadata_checked: "Metadata checked",
  processor_uploading: "Sending to NodeODM",
  processing: "Processing",
  processed: "Processed",
  failed: "Failed",
};

const COLORS: Record<string, string> = {
  stored: V.telemetry,
  downloading: V.signal,
  downloaded: V.telemetry,
  metadata_checked: V.telemetry,
  processor_uploading: V.signal,
  processing: V.signal,
  processed: "#70D6A0",
  failed: V.danger,
};

export default function MappingImageStatusList({ images }: { images: MappingImage[] }) {
  const [open, setOpen] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    images.forEach((image) => map.set(image.lifecycle_status ?? "stored", (map.get(image.lifecycle_status ?? "stored") ?? 0) + 1));
    return map;
  }, [images]);

  if (images.length === 0) return null;

  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${V.lineSoft}`, paddingTop: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{ ...btnGhost, width: "100%", justifyContent: "space-between", padding: "8px 10px", display: "flex", alignItems: "center" }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <ImageIcon size={14} />
          View all {images.length} images
        </span>
        <span style={{ color: V.inkFaint, fontSize: 10 }}>
          {[...counts.entries()].map(([status, count]) => `${count} ${LABELS[status] ?? status}`).join(" · ")}
        </span>
      </button>

      {open ? (
        <div style={{ marginTop: 8, maxHeight: 360, overflow: "auto", border: `1px solid ${V.line}`, borderRadius: 9 }}>
          {images.map((image, index) => {
            const status = image.lifecycle_status ?? "stored";
            const metadataVerified = Boolean(image.camera_make || image.camera_model || image.captured_at || image.latitude != null);
            return (
              <div
                key={image.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px minmax(220px,1.8fr) 92px 150px 130px",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 10px",
                  borderBottom: index < images.length - 1 ? `1px solid ${V.lineSoft}` : "none",
                  fontSize: 11,
                  background: index % 2 ? "rgba(255,255,255,.015)" : "transparent",
                }}
              >
                <span className="font-mono-ibm" style={{ color: V.inkFaint }}>#{index + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div title={image.original_filename ?? image.storage_path} style={{ color: V.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 650 }}>
                    {image.original_filename ?? image.storage_path.split("/").pop()}
                  </div>
                  {image.lifecycle_error ? <div style={{ color: V.danger, fontSize: 9, marginTop: 2 }}>{image.lifecycle_error}</div> : null}
                </div>
                <span style={{ color: V.inkDim, textAlign: "right" }}>{formatBytes(image.file_size ?? 0)}</span>
                <span style={{ color: COLORS[status] ?? V.inkDim, fontWeight: 800 }}>{LABELS[status] ?? status}</span>
                <span style={{ color: metadataVerified ? V.telemetry : V.inkFaint }}>
                  {metadataVerified ? "Metadata verified" : "Metadata pending"}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
