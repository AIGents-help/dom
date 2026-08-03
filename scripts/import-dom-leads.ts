// Repeatable, idempotent importer for DOM_Smartlead_Verified_Leads.csv into the
// `leads` table. Uses the Supabase service-role key (this is a trusted CLI
// script, never shipped to the browser) so it isn't gated by the admin_users
// RLS policy the way the browser client is.
//
// Usage:
//   npx tsx scripts/import-dom-leads.ts --file=.local-imports/DOM_Smartlead_Verified_Leads.csv
//   npx tsx scripts/import-dom-leads.ts --file=... --commit
//
// Dry-run is the default. Nothing is written to Supabase unless --commit is
// passed. Nothing is ever sent to Smartlead by this script.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const REPO_ROOT = resolve(__dirname, "..");

const VALID_INDUSTRIES = new Set([
  "telecom_towers", "refinery_petrochemical", "utilities", "construction",
  "surveying_engineering", "commercial_real_estate", "roofing", "solar",
  "municipal", "public_safety", "environmental", "agriculture", "other",
]);
const VALID_ENGAGEMENT_MODELS = new Set([
  "direct_project", "subcontracted_project", "joint_project",
  "staff_augmentation", "white_label_service", "referral_only", "unknown",
]);
const VALID_OWNERSHIP = new Set(["dom_owned", "partner_owned", "shared", "unknown"]);

// --- tiny .env.local loader (this script runs outside Next.js, which is the
// only thing that auto-loads .env.local) -----------------------------------
function loadEnvLocal() {
  const path = resolve(REPO_ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const m = s.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

// --- minimal RFC4180-ish CSV parser (no new dependency) --------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, "\n");
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i];
    if (inQuotes) {
      if (c === '"') {
        if (normalized[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

// Recognized header variants -> canonical field name. Extend this map once
// the real CSV's headers are known — it's intentionally permissive.
const HEADER_MAP: Record<string, string> = {
  company: "company", "company name": "company", company_name: "company", organization: "company",
  contact: "name", "contact name": "name", name: "name",
  first_name: "first_name", last_name: "last_name",
  email: "email", "email address": "email",
  phone: "phone", "phone number": "phone",
  industry: "industry", vertical: "industry", sector: "industry",
  website: "source_url", "source url": "source_url", url: "source_url", "company website": "source_url", source_url: "source_url",
  notes: "verification_notes", "verification notes": "verification_notes",
  address: "address", location: "address",
  "company type": "company_type", type: "company_type", role: "company_type", category: "company_type", target_role: "target_role",
  personalization: "personalization", last_verified: "last_verified",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function guessEngagementModel(companyType: string): string {
  const t = companyType.toLowerCase();
  if (/tower|inspection/.test(t)) return "subcontracted_project";
  if (/engineering|surveying|design|delivery partner/.test(t)) return "joint_project";
  return "unknown";
}

function guessIndustry(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (VALID_INDUSTRIES.has(t)) return t;
  if (/tower|telecom/.test(t)) return "telecom_towers";
  if (/refin|petro/.test(t)) return "refinery_petrochemical";
  if (/utilit/.test(t)) return "utilities";
  if (/construct/.test(t)) return "construction";
  if (/survey|engineer/.test(t)) return "surveying_engineering";
  if (/real estate|cre\b/.test(t)) return "commercial_real_estate";
  if (/roof/.test(t)) return "roofing";
  if (/solar/.test(t)) return "solar";
  if (/municip|city|county|government/.test(t)) return "municipal";
  if (/public safety|fire|police/.test(t)) return "public_safety";
  if (/environ/.test(t)) return "environmental";
  if (/agri|farm/.test(t)) return "agriculture";
  return null;
}

type ImportRow = {
  company: string | null; name: string | null; email: string | null; phone: string | null;
  address: string | null; industry: string | null; engagement_model: string; opportunity_ownership: string;
  source_url: string | null; verification_notes: string | null;
};

type RowResult =
  | { kind: "inserted"; row: ImportRow }
  | { kind: "updated"; row: ImportRow; leadId: string }
  | { kind: "unchanged"; row: ImportRow; leadId: string }
  | { kind: "skipped"; reason: string; raw: Record<string, string> }
  | { kind: "duplicate_in_file"; raw: Record<string, string> }
  | { kind: "validation_failure"; reason: string; raw: Record<string, string> };

async function main() {
  loadEnvLocal();

  const args = process.argv.slice(2);
  const fileArg = args.find((a) => a.startsWith("--file="))?.split("=")[1];
  const commit = args.includes("--commit");
  const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const limit = limitArg ? parseInt(limitArg, 10) : undefined;

  const filePath = resolve(REPO_ROOT, fileArg ?? ".local-imports/DOM_Smartlead_Verified_Leads.csv");
  if (!existsSync(filePath)) {
    console.error(`Import file not found: ${filePath}`);
    console.error(`Pass --file=path/to/file.csv, or place the verified CSV at .local-imports/DOM_Smartlead_Verified_Leads.csv`);
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (run `vercel env pull .env.local` first).");
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const raw = readFileSync(filePath, "utf8");
  const table = parseCsv(raw);
  if (table.length === 0) {
    console.error("File is empty.");
    process.exitCode = 1;
    return;
  }

  const headerRow = table[0].map(normalizeHeader);
  const mappedFields = headerRow.map((h) => HEADER_MAP[h] ?? null);
  const hasCompanyOrName = mappedFields.includes("company") || mappedFields.includes("name");
  if (!hasCompanyOrName) {
    console.error(`Header validation failed. Recognized columns: ${headerRow.filter((h) => HEADER_MAP[h]).join(", ") || "(none)"}.`);
    console.error(`At least a company or contact-name column is required. Found headers: ${table[0].join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const dataRows = table.slice(1).slice(0, limit);
  const total = dataRows.length;

  console.log(`Loaded ${total} data row(s) from ${filePath}`);
  console.log(`Mode: ${commit ? "COMMIT (writing to Supabase)" : "DRY RUN (no writes)"}`);
  console.log("");

  // Load existing leads once for local fallback matching + change detection.
  const { data: existingLeads, error: loadErr } = await supabase
    .from("leads")
    .select("id, email, company, name, phone, address, industry, engagement_model, opportunity_ownership, source_url, verification_notes");
  if (loadErr) {
    console.error("Failed to load existing leads:", loadErr.message);
    console.error("(If this says a column does not exist, the migration in supabase/migrations/ hasn't been applied yet.)");
    process.exitCode = 1;
    return;
  }
  const byEmail = new Map<string, (typeof existingLeads)[number]>();
  const byCompanyName = new Map<string, (typeof existingLeads)[number]>();
  for (const l of existingLeads ?? []) {
    if (l.email) byEmail.set(normalizeEmail(l.email), l);
    const key = `${(l.company ?? "").trim().toLowerCase()}::${(l.name ?? "").trim().toLowerCase()}`;
    if (key !== "::") byCompanyName.set(key, l);
  }

  const seenInFile = new Set<string>();
  const results: RowResult[] = [];

  for (const cells of dataRows) {
    const record: Record<string, string> = {};
    headerRow.forEach((h, i) => {
      const field = HEADER_MAP[h];
      if (field) record[field] = (cells[i] ?? "").trim();
    });

    const company = record.company?.trim() || null;
    const combinedFirstLast = [record.first_name, record.last_name].filter((p) => p && p.trim()).join(" ").trim();
    const name = record.name?.trim() || (combinedFirstLast || null);
    const emailRaw = record.email?.trim() || "";
    const email = emailRaw ? normalizeEmail(emailRaw) : null;
    const phone = record.phone?.trim() || null;
    const address = record.address?.trim() || null;
    const sourceUrl = record.source_url ? normalizeUrl(record.source_url) : null;
    const companyType = record.company_type ?? "";

    // Preserve context notes (personalization research, target role, and the
    // as-of date this contact was verified) even though there's no dedicated
    // column per field — verification_notes is the closest canonical fit.
    const notesParts = [
      record.verification_notes?.trim(),
      record.personalization?.trim(),
      record.target_role?.trim() ? `Target role: ${record.target_role.trim()}` : "",
      record.last_verified?.trim() ? `Verified as of: ${record.last_verified.trim()}` : "",
    ].filter((p): p is string => !!p);
    const verificationNotes = notesParts.length > 0 ? notesParts.join(" | ") : null;

    if (!company && !name) {
      results.push({ kind: "validation_failure", reason: "Missing both company and contact name — cannot import.", raw: record });
      continue;
    }
    if (email && !isValidEmail(email)) {
      results.push({ kind: "validation_failure", reason: `Invalid email: "${emailRaw}"`, raw: record });
      continue;
    }

    // Never guess a missing email — dedupe key is email if present, else
    // company+name. If neither is usable, the row already failed above.
    const dedupeKey = email ?? `${(company ?? "").toLowerCase()}::${(name ?? "").toLowerCase()}`;
    if (seenInFile.has(dedupeKey)) {
      results.push({ kind: "duplicate_in_file", raw: record });
      continue;
    }
    seenInFile.add(dedupeKey);

    const industry = guessIndustry(record.industry || companyType || "");
    const engagementModel = guessEngagementModel(companyType || record.industry || "");
    const opportunityOwnership = "unknown"; // never inferred without explicit evidence, per import rules

    const importRow: ImportRow = {
      company, name, email, phone, address,
      industry: industry && VALID_INDUSTRIES.has(industry) ? industry : null,
      engagement_model: VALID_ENGAGEMENT_MODELS.has(engagementModel) ? engagementModel : "unknown",
      opportunity_ownership: VALID_OWNERSHIP.has(opportunityOwnership) ? opportunityOwnership : "unknown",
      source_url: sourceUrl,
      verification_notes: verificationNotes,
    };

    const existing = email ? byEmail.get(email) : byCompanyName.get(`${(company ?? "").toLowerCase()}::${(name ?? "").toLowerCase()}`);

    if (!existing) {
      results.push({ kind: "inserted", row: importRow });
      if (commit) {
        const { error } = await supabase.from("leads").insert({
          company: importRow.company, name: importRow.name, email: importRow.email, phone: importRow.phone,
          address: importRow.address, industry: importRow.industry, engagement_model: importRow.engagement_model,
          opportunity_ownership: importRow.opportunity_ownership, source: "csv_import",
          // "new" is the pipeline stage for a not-yet-approved lead (see
          // lib/leadsPipeline.ts STATUS_OPTIONS). Outreach approval
          // (outreach_approved_at) is a distinct, human-triggered step this
          // importer never sets.
          status: "new",
          source_url: importRow.source_url, verification_notes: importRow.verification_notes,
        });
        if (error) { results[results.length - 1] = { kind: "validation_failure", reason: `Insert failed: ${error.message}`, raw: record }; }
      }
      continue;
    }

    const changed =
      (existing.phone ?? null) !== importRow.phone ||
      (existing.address ?? null) !== importRow.address ||
      (existing.industry ?? null) !== importRow.industry ||
      (existing.source_url ?? null) !== importRow.source_url ||
      (existing.verification_notes ?? null) !== importRow.verification_notes;

    if (!changed) {
      results.push({ kind: "unchanged", row: importRow, leadId: existing.id });
      continue;
    }

    results.push({ kind: "updated", row: importRow, leadId: existing.id });
    if (commit) {
      const { error } = await supabase.from("leads").update({
        phone: importRow.phone ?? existing.phone,
        address: importRow.address ?? existing.address,
        industry: importRow.industry ?? existing.industry,
        source_url: importRow.source_url ?? existing.source_url,
        verification_notes: importRow.verification_notes ?? existing.verification_notes,
      }).eq("id", existing.id);
      if (error) { results[results.length - 1] = { kind: "validation_failure", reason: `Update failed: ${error.message}`, raw: record }; }
    }
  }

  const counts = {
    total,
    valid: results.filter((r) => r.kind === "inserted" || r.kind === "updated" || r.kind === "unchanged").length,
    inserted: results.filter((r) => r.kind === "inserted").length,
    updated: results.filter((r) => r.kind === "updated").length,
    unchanged: results.filter((r) => r.kind === "unchanged").length,
    skipped: results.filter((r) => r.kind === "skipped").length,
    duplicates: results.filter((r) => r.kind === "duplicate_in_file").length,
    validation_failures: results.filter((r) => r.kind === "validation_failure").length,
  };
  const outreachReviewReady = results.filter(
    (r) => (r.kind === "inserted" || r.kind === "updated" || r.kind === "unchanged") && r.row.email && isValidEmail(r.row.email)
  ).length;

  console.log("--- Import report ---");
  console.log(JSON.stringify(counts, null, 2));
  console.log(`Rows with a verified email (compatible with a future outreach-approval review): ${outreachReviewReady}`);

  const failures = results.filter((r): r is Extract<RowResult, { kind: "validation_failure" }> => r.kind === "validation_failure");
  if (failures.length > 0) {
    console.log("\n--- Validation failures ---");
    for (const f of failures.slice(0, 25)) console.log(`- ${f.reason}`);
    if (failures.length > 25) console.log(`... and ${failures.length - 25} more`);
  }

  if (!commit) {
    console.log("\nDry run complete. No rows were written. Re-run with --commit after reviewing this report.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
