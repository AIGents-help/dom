"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

// Admin > Mission Briefing — the full operational package for a mission:
// documents, contacts, expenses, permissions/clearances, and a SkyVector
// sectional chart link. This is what a pilot opens to know everything about
// a job without having to research or coordinate anything themselves.

interface MissionRequest {
  id: string;
  requester_name: string | null;
  company: string | null;
  service_type: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  skyvector_url: string | null;
  site_access_instructions: string | null;
  special_equipment: string | null;
  hazards: string | null;
  notes_for_pilot: string | null;
  scheduled_date: string | null;
  scheduled_time_local: string | null;
  estimated_duration_minutes: number | null;
  weather_go_nogo: string | null;
}

interface DocRow {
  id: string;
  category: string;
  name: string;
  file_url: string | null;
  is_required: boolean;
  is_completed: boolean;
}

interface ContactRow {
  id: string;
  role: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
}

interface ExpenseRow {
  id: string;
  category: string;
  description: string;
  amount_cents: number;
  quantity: number;
  total_cents: number;
  billable_to_client: boolean;
  status: string;
}

interface PermissionRow {
  id: string;
  permission_type: string;
  title: string;
  status: string;
  authority: string | null;
  reference_number: string | null;
}

function skyvectorUrl(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `https://skyvector.com/?ll=${lat},${lng}&chart=301&zoom=2`;
}

export default function MissionBriefingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mission, setMission] = useState<MissionRequest | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const { data: mr } = await sb.from("mission_requests").select("*").eq("id", id).single();
    setMission(mr as MissionRequest | null);

    const [{ data: d }, { data: c }, { data: e }, { data: p }] = await Promise.all([
      sb.from("mission_documents").select("id, category, name, file_url, is_required, is_completed").eq("mission_request_id", id).order("sort_order"),
      sb.from("mission_contacts").select("id, role, name, phone, email, company").eq("mission_request_id", id).order("sort_order"),
      sb.from("mission_expenses").select("id, category, description, amount_cents, quantity, total_cents, billable_to_client, status").eq("mission_request_id", id).order("created_at"),
      sb.from("mission_permissions").select("id, permission_type, title, status, authority, reference_number").eq("mission_request_id", id).order("created_at"),
    ]);
    setDocs((d as DocRow[]) ?? []);
    setContacts((c as ContactRow[]) ?? []);
    setExpenses((e as ExpenseRow[]) ?? []);
    setPermissions((p as PermissionRow[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    (async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb.auth.getSession();
      if (!data.session) {
        router.push("/admin/login");
        return;
      }
      setAuthed(true);
      load();
    })();
  }, [router, load]);

  const addDoc = useCallback(async (form: { category: string; name: string; is_required: boolean; file: File | null }) => {
    setError(null);
    const sb = getSupabaseBrowser();
    let file_url: string | null = null;
    if (form.file) {
      const path = `${id}/${Date.now()}-${form.file.name}`;
      const { error: uploadError } = await sb.storage.from("mission-documents").upload(path, form.file);
      if (uploadError) { setError(uploadError.message); return; }
      file_url = path;
    }
    const { error: insErr } = await sb.from("mission_documents").insert({
      mission_request_id: id, category: form.category, name: form.name, is_required: form.is_required, file_url,
    });
    if (insErr) { setError(insErr.message); return; }
    await load();
  }, [id, load]);

  const downloadDoc = useCallback(async (storageUrl: string) => {
    const sb = getSupabaseBrowser();
    const { data, error: signError } = await sb.storage.from("mission-documents").createSignedUrl(storageUrl, 300);
    if (signError || !data) { setError(signError?.message ?? "Could not generate download link"); return; }
    window.open(data.signedUrl, "_blank");
  }, []);

  const addContact = useCallback(async (form: { role: string; name: string; phone: string; email: string }) => {
    setError(null);
    const sb = getSupabaseBrowser();
    const { error: insErr } = await sb.from("mission_contacts").insert({ mission_request_id: id, ...form });
    if (insErr) { setError(insErr.message); return; }
    await load();
  }, [id, load]);

  const addExpense = useCallback(async (form: { category: string; description: string; amount_cents: number; quantity: number; billable_to_client: boolean }) => {
    setError(null);
    const sb = getSupabaseBrowser();
    const total_cents = Math.round(form.amount_cents * form.quantity);
    const { error: insErr } = await sb.from("mission_expenses").insert({ mission_request_id: id, ...form, total_cents });
    if (insErr) { setError(insErr.message); return; }
    await load();
  }, [id, load]);

  const addPermission = useCallback(async (form: { permission_type: string; title: string; authority: string }) => {
    setError(null);
    const sb = getSupabaseBrowser();
    const { error: insErr } = await sb.from("mission_permissions").insert({ mission_request_id: id, ...form });
    if (insErr) { setError(insErr.message); return; }
    await load();
  }, [id, load]);

  const setPermissionStatus = useCallback(async (permId: string, status: string) => {
    const sb = getSupabaseBrowser();
    const patch: Record<string, unknown> = { status };
    if (status === "approved") patch.approved_at = new Date().toISOString();
    await sb.from("mission_permissions").update(patch).eq("id", permId);
    await load();
  }, [load]);

  const toggleDocDone = useCallback(async (docId: string, done: boolean) => {
    const sb = getSupabaseBrowser();
    await sb.from("mission_documents").update({ is_completed: done }).eq("id", docId);
    await load();
  }, [load]);

  if (!authed) return null;

  const sky = mission ? (mission.skyvector_url || skyvectorUrl(mission.latitude, mission.longitude)) : null;

  return (
    <Shell>
      <button onClick={() => router.push(`/admin/missions/${id}`)} style={{ ...btnGhost, marginBottom: 16 }}>
        ← Back to Mission
      </button>

      {loading && <p style={{ color: V.inkDim }}>Loading…</p>}

      {!loading && !mission && (
        <div style={panel}><p style={{ color: V.inkDim }}>Mission not found.</p></div>
      )}

      {!loading && mission && (
        <div style={{ display: "grid", gap: 18 }}>
          <div style={panel}>
            <h1 className="font-saira" style={{ fontSize: 24, fontWeight: 700 }}>Mission Briefing</h1>
            <p style={{ color: V.inkDim, fontSize: 14, marginTop: 4 }}>
              {mission.company ?? mission.requester_name ?? "Unnamed"} · {(mission.service_type ?? "").replace(/_/g, " ")} · {mission.location ?? "No location"}
            </p>
            {sky && (
              <a href={sky} target="_blank" rel="noreferrer" style={{ ...btnPrimary, marginTop: 14, display: "inline-block", textDecoration: "none" }}>
                Open SkyVector Chart →
              </a>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: V.lineSoft, borderRadius: 10, overflow: "hidden", marginTop: 14 }}>
              <Readout k="Scheduled" v={mission.scheduled_date ? `${mission.scheduled_date}${mission.scheduled_time_local ? " " + mission.scheduled_time_local : ""}` : "—"} />
              <Readout k="Est. Duration" v={mission.estimated_duration_minutes ? `${mission.estimated_duration_minutes} min` : "—"} />
              <Readout k="Weather" v={mission.weather_go_nogo ?? "—"} />
            </div>
            {mission.site_access_instructions && <NoteBlock label="Site Access" text={mission.site_access_instructions} />}
            {mission.special_equipment && <NoteBlock label="Special Equipment" text={mission.special_equipment} />}
            {mission.hazards && <NoteBlock label="Hazards" text={mission.hazards} />}
            {mission.notes_for_pilot && <NoteBlock label="Notes for Pilot" text={mission.notes_for_pilot} />}
          </div>

          {error && (
            <div style={{ ...panel, borderColor: "#FF8A3D" }}>
              <p style={{ color: "#FF8A3D", fontSize: 13 }}>{error}</p>
            </div>
          )}

          <Section title="Permissions & Clearances">
            {permissions.map((p) => (
              <RowCard key={p.id}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{p.title}</span>
                    <span style={{ color: V.inkFaint, fontSize: 12, marginLeft: 8 }}>{p.permission_type.replace(/_/g, " ")}</span>
                    {p.authority && <div style={{ color: V.inkDim, fontSize: 12 }}>{p.authority}{p.reference_number ? ` · Ref ${p.reference_number}` : ""}</div>}
                  </div>
                  <select value={p.status} onChange={(e) => setPermissionStatus(p.id, e.target.value)} style={{ ...inputStyle, width: "auto", marginTop: 0, padding: "6px 10px", fontSize: 12 }}>
                    {["required", "requested", "pending", "approved", "denied", "expired", "waived"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </RowCard>
            ))}
            <AddPermissionForm onAdd={addPermission} />
          </Section>

          <Section title="Documents">
            {docs.map((d) => (
              <RowCard key={d.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{d.name}</span>
                    <span style={{ color: V.inkFaint, fontSize: 12, marginLeft: 8 }}>{d.category.replace(/_/g, " ")}{d.is_required ? " · required" : ""}</span>
                    {d.file_url && (
                      <button onClick={() => downloadDoc(d.file_url!)} style={{ background: "none", border: "none", color: V.telemetry, fontSize: 12, marginLeft: 8, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                        download
                      </button>
                    )}
                  </div>
                  <label style={{ fontSize: 12, color: V.inkDim, display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={d.is_completed} onChange={(e) => toggleDocDone(d.id, e.target.checked)} /> done
                  </label>
                </div>
              </RowCard>
            ))}
            <AddDocForm onAdd={addDoc} />
          </Section>

          <Section title="Contacts">
            {contacts.map((c) => (
              <RowCard key={c.id}>
                <div>
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  <span style={{ color: V.inkFaint, fontSize: 12, marginLeft: 8 }}>{c.role.replace(/_/g, " ")}</span>
                  <div style={{ color: V.inkDim, fontSize: 12 }}>
                    {[c.phone, c.email, c.company].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
              </RowCard>
            ))}
            <AddContactForm onAdd={addContact} />
          </Section>

          <Section title="Expenses">
            {expenses.map((e) => (
              <RowCard key={e.id}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{e.description}</span>
                    <span style={{ color: V.inkFaint, fontSize: 12, marginLeft: 8 }}>{e.category.replace(/_/g, " ")} · {e.status}</span>
                  </div>
                  <span className="font-mono-ibm" style={{ color: V.telemetry, fontSize: 13 }}>
                    ${(e.total_cents / 100).toFixed(2)}{e.billable_to_client ? " (billable)" : ""}
                  </span>
                </div>
              </RowCard>
            ))}
            <AddExpenseForm onAdd={addExpense} />
          </Section>
        </div>
      )}
    </Shell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={panel}>
      <Label>{title}</Label>
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>{children}</div>
    </div>
  );
}

function RowCard({ children }: { children: React.ReactNode }) {
  return <div style={{ ...panel, padding: 14, background: V.raised }}>{children}</div>;
}

function NoteBlock({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="font-mono-ibm" style={{ fontSize: 10, letterSpacing: ".12em", color: V.inkFaint, textTransform: "uppercase" }}>{label}</div>
      <p style={{ color: V.inkDim, fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}

function AddDocForm({ onAdd }: { onAdd: (f: { category: string; name: string; is_required: boolean; file: File | null }) => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("authorization");
  const [required, setRequired] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input placeholder="Document name" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, width: 220, marginTop: 0 }} />
      <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...inputStyle, width: 180, marginTop: 0 }}>
        {["authorization", "permit", "waiver", "insurance", "site_access", "client_contract", "laanc", "notam", "safety", "equipment", "reference", "other"].map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
      </select>
      <label style={{ fontSize: 12, color: V.inkDim, display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> required
      </label>
      <label style={{ ...btnGhost, display: "inline-block", fontSize: 12, padding: "8px 12px" }}>
        {file ? file.name.slice(0, 20) : "Choose file (optional)"}
        <input type="file" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <button style={btnGhost} disabled={!name} onClick={() => { onAdd({ name, category, is_required: required, file }); setName(""); setRequired(false); setFile(null); }}>Add</button>
    </div>
  );
}

function AddContactForm({ onAdd }: { onAdd: (f: { role: string; name: string; phone: string; email: string }) => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("client_poc");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, width: 160, marginTop: 0 }} />
      <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...inputStyle, width: 160, marginTop: 0 }}>
        {["client_poc", "site_manager", "property_owner", "atc", "dom_ops", "emergency", "contractor", "observer", "utility_contact", "other"].map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
      </select>
      <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ ...inputStyle, width: 130, marginTop: 0 }} />
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...inputStyle, width: 180, marginTop: 0 }} />
      <button style={btnGhost} disabled={!name} onClick={() => { onAdd({ role, name, phone, email }); setName(""); setPhone(""); setEmail(""); }}>Add</button>
    </div>
  );
}

function AddExpenseForm({ onAdd }: { onAdd: (f: { category: string; description: string; amount_cents: number; quantity: number; billable_to_client: boolean }) => void }) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("travel_mileage");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [billable, setBillable] = useState(true);
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, width: 180, marginTop: 0 }} />
      <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ ...inputStyle, width: 160, marginTop: 0 }}>
        {["travel_mileage", "travel_flight", "hotel", "per_diem", "equipment_rental", "parking", "tolls", "fuel", "supplies", "other"].map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
      </select>
      <input placeholder="Amount $" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inputStyle, width: 100, marginTop: 0 }} />
      <input placeholder="Qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ ...inputStyle, width: 70, marginTop: 0 }} />
      <label style={{ fontSize: 12, color: V.inkDim, display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} /> billable
      </label>
      <button
        style={btnGhost}
        disabled={!description || !amount}
        onClick={() => {
          onAdd({ category, description, amount_cents: Math.round(parseFloat(amount) * 100), quantity: parseFloat(quantity) || 1, billable_to_client: billable });
          setDescription(""); setAmount(""); setQuantity("1");
        }}
      >
        Add
      </button>
    </div>
  );
}

function AddPermissionForm({ onAdd }: { onAdd: (f: { permission_type: string; title: string; authority: string }) => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("laanc");
  const [authority, setAuthority] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...inputStyle, width: 200, marginTop: 0 }} />
      <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...inputStyle, width: 180, marginTop: 0 }}>
        {["laanc", "property_access", "bvlos_waiver", "night_waiver", "tfr_exemption", "utility_clearance", "government_clearance", "faa_coordination", "airport_notification", "state_permit", "local_permit", "client_authorization", "insurance_certificate", "other"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
      </select>
      <input placeholder="Authority" value={authority} onChange={(e) => setAuthority(e.target.value)} style={{ ...inputStyle, width: 160, marginTop: 0 }} />
      <button style={btnGhost} disabled={!title} onClick={() => { onAdd({ permission_type: type, title, authority }); setTitle(""); setAuthority(""); }}>Add</button>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: V.ground, color: V.ink, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="font-mono-ibm" style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: V.signal }}>{children}</div>;
}

function Readout({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ background: V.raised, padding: "10px 14px" }}>
      <div className="font-mono-ibm" style={{ fontSize: 10, letterSpacing: ".12em", color: V.inkFaint, textTransform: "uppercase" }}>{k}</div>
      <div className="font-mono-ibm" style={{ fontSize: 13, color: V.ink, marginTop: 2, fontWeight: 500 }}>{v}</div>
    </div>
  );
}

const V = {
  ground: "#0A0E14", surface: "#11161F", raised: "#161D29",
  line: "#232C3B", lineSoft: "#1A222F",
  ink: "#E8ECF2", inkDim: "#8A95A7", inkFaint: "#5A6678",
  signal: "#FF8A3D", telemetry: "#4FD1C5",
};
const panel: React.CSSProperties = { border: `1px solid ${V.line}`, borderRadius: 14, background: V.surface, padding: 18 };
const btnPrimary: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, border: "none", background: V.signal, color: V.ground, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 14, cursor: "pointer" };
const btnGhost: React.CSSProperties = { padding: "8px 14px", borderRadius: 10, border: `1px solid ${V.line}`, background: "transparent", color: V.ink, fontFamily: "Saira, sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const inputStyle: React.CSSProperties = { width: "100%", marginTop: 6, padding: "11px 12px", borderRadius: 9, border: `1px solid ${V.line}`, background: V.ground, color: V.ink, fontSize: 14, outline: "none" };
