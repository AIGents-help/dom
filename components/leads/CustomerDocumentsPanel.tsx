"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { ActionBtn, inputCls, labelCls } from "@/components/adminUi";

interface CustomerDocument {
  id: string;
  original_name: string;
  description: string | null;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

export default function CustomerDocumentsPanel({ leadId, busy }: { leadId: string; busy: boolean }) {
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const request = useCallback(async (init?: RequestInit, query = "") => {
    const { data } = await getSupabaseBrowser().auth.getSession();
    if (!data.session) throw new Error("Your admin session has expired.");
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
    return fetch(`/api/admin/leads/${leadId}/documents${query}`, { ...init, headers });
  }, [leadId]);

  const load = useCallback(async () => {
    try {
      const response = await request();
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not load documents.");
      setDocuments(body.documents ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load documents.");
    }
  }, [request]);

  useEffect(() => { void load(); }, [load]);

  async function upload() {
    if (!file) return;
    setWorking(true); setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("description", description);
      const response = await request({ method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Upload failed.");
      setFile(null); setDescription(""); setMessage("Document attached to this CRM file.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally { setWorking(false); }
  }

  async function openDocument(documentId: string) {
    const response = await request(undefined, `?documentId=${encodeURIComponent(documentId)}`);
    const body = await response.json();
    if (!response.ok) { setMessage(body.error ?? "Could not open document."); return; }
    window.open(body.url, "_blank", "noopener,noreferrer");
  }

  async function removeDocument(documentId: string) {
    if (!window.confirm("Remove this document from the customer file?")) return;
    setWorking(true); setMessage("");
    try {
      const response = await request({ method: "DELETE" }, `?documentId=${encodeURIComponent(documentId)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not remove document.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove document.");
    } finally { setWorking(false); }
  }

  return <div className="space-y-5 text-sm text-ink">
    <div>
      <h3 className="font-semibold">Customer documents</h3>
      <p className="mt-1 text-xs text-muted">Attach contracts, proposals, insurance files, site information, correspondence, and other customer records. Files remain private to DOM Admin.</p>
    </div>
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div><label className={labelCls}>Document</label><input type="file" className={inputCls} disabled={working || busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div>
      <div><label className={labelCls}>Description (optional)</label><input className={inputCls} value={description} disabled={working || busy} onChange={(event) => setDescription(event.target.value)} placeholder="What this file is for" /></div>
      <ActionBtn disabled={!file || working || busy} onClick={upload}>{working ? "Uploading…" : "Attach Document"}</ActionBtn>
      {message && <p aria-live="polite" className="text-xs text-muted">{message}</p>}
    </div>
    <div className="space-y-2">
      {!documents.length && <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted">No documents attached yet.</div>}
      {documents.map((document) => <div key={document.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
        <button type="button" onClick={() => openDocument(document.id)} className="min-w-0 text-left">
          <span className="block truncate font-medium text-accent hover:underline">{document.original_name}</span>
          <span className="text-xs text-muted">{document.description || "No description"} · {document.size_bytes < 1024 * 1024 ? `${(document.size_bytes / 1024).toFixed(0)} KB` : `${(document.size_bytes / 1024 / 1024).toFixed(1)} MB`} · {new Date(document.created_at).toLocaleDateString()}</span>
        </button>
        <button type="button" disabled={working || busy} onClick={() => removeDocument(document.id)} className="shrink-0 text-xs text-rose-400 hover:underline">Remove</button>
      </div>)}
    </div>
  </div>;
}
