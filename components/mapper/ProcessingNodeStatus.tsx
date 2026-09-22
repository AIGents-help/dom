"use client";

import { useCallback, useEffect, useState } from "react";
import { V, btnPrimary } from "./theme";

type NodeRow = {
  worker_id: string; display_name: string; status: string; nodeodm_status: string; docker_status: string;
  nodeodm_version: string | null; last_error: string | null; online: boolean;
};

export default function ProcessingNodeStatus({ accessToken }: { accessToken: string }) {
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/pilot/mapping/nodes", {
      headers: { Authorization: "Bearer " + accessToken },
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({ nodes: [] }));
    if (res.ok) setNodes(body.nodes ?? []);
    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 15000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const node = nodes[0];
  const ready = Boolean(node?.online && node.nodeodm_status === "ready" && ["ready", "processing"].includes(node.status));

  function startNode() {
    window.location.href = "dominic://start-node";
    window.setTimeout(refresh, 5000);
  }

  return (
    <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, border: "1px solid " + (ready ? "#2F8F5B" : V.warn), background: ready ? "rgba(47,143,91,.08)" : "rgba(229,112,31,.06)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: ready ? "#70D6A0" : V.warn, fontSize: 12, fontWeight: 800, letterSpacing: ".05em" }}>
            {loading ? "CHECKING PROCESSING NODE…" : ready ? "DOMINIC PROCESSING NODE READY" : "DOMINIC PROCESSING NODE OFFLINE"}
          </div>
          <div style={{ color: V.inkDim, fontSize: 11, marginTop: 4 }}>
            {node ? node.display_name + " · Docker " + node.docker_status + " · NodeODM " + node.nodeodm_status + (node.nodeodm_version ? " " + node.nodeodm_version : "") : "No processing agent has checked in yet."}
          </div>
          {node?.last_error ? <div style={{ color: V.danger, fontSize: 11, marginTop: 5 }}>{node.last_error}</div> : null}
        </div>
        {!ready ? (
          <button type="button" onClick={startNode} style={{ ...btnPrimary, padding: "8px 11px", fontSize: 11 }}>Start Processing Node</button>
        ) : (
          <div style={{ color: V.inkFaint, fontSize: 11 }}>{node.status === "processing" ? "Processing a job" : "Waiting for queued work"}</div>
        )}
      </div>
    </div>
  );
}
