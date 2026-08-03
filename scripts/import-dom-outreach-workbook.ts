// Repeatable, idempotent importer for DOM_Smartlead_Tower_Industrial_Outreach.xlsx.
//
// The workbook has 5 sheets. Only two contain prospect data:
//   - "Verified Leads"  — same shape/content as DOM_Smartlead_Verified_Leads.csv.
//                         Imported through the identical logic to prove the
//                         importer is idempotent across file formats too.
//   - "Research Queue"  — company-level prospects with NO discovered contact
//                         or email yet. Imported as Research Needed: no name,
//                         no email (never guessed), `next_action` preserved
//                         verbatim from the sheet's own next_action column.
// "Campaign Copy", "Smartlead Settings", and "QA" are NOT prospect data
// (email templates, campaign config, a self-check report) and are skipped.
//
// Usage:
//   npx tsx scripts/import-dom-outreach-workbook.ts --file=.local-imports/DOM_Smartlead_Tower_Industrial_Outreach.xlsx
//   npx tsx scripts/import-dom-outreach-workbook.ts --file=... --commit
//
// Dry-run is the default. Nothing is ever sent to Smartlead by this script.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

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

const PROSPECT_SHEETS = new Set(["Verified Leads", "Research Queue"]);
const SKIPPED_SHEETS_REASON: Record<string, string> = {
  "Campaign Copy": "Email template copy, not prospect data.",
  "Smartlead Settings": "Campaign configuration recommendations, not prospect data.",
  QA: "A self-check report on the Verified Leads sheet, not prospect data.",
};

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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function normalizeUrl(url: string): string | null {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
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
  source_url: string | null; verification_notes: string | null; next_action: string | null; source: string;
};
type Bucket = "verified" | "research_needed";
type RowResult =
  | { kind: "inserted"; bucket: Bucket; row: ImportRow }
  | { kind: "updated"; bucket: Bucket; row: ImportRow; leadId: string }
  | { kind: "unchanged"; bucket: Bucket; row: ImportRow; leadId: string }
  | { kind: "duplicate_in_file"; bucket: Bucket }
  | { kind: "validation_failure"; bucket: Bucket; reason: string };

function sheetRows(wb: XLSX.WorkBook, name: string): Record<string, string>[] {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => String(h).trim());
  return rows.slice(1)
    .filter((r) => r.some((c) => String(c).trim() !== ""))
    .map((r) => {
      const rec: Record<string, string> = {};
      headers.forEach((h, i) => { rec[h] = String(r[i] ?? "").trim(); });
      return rec;
    });
}

async function main() {
  loadEnvLocal();
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => a.startsWith("--file="))?.split("=")[1];
  const commit = args.includes("--commit");

  const filePath = resolve(REPO_ROOT, fileArg ?? ".local-imports/DOM_Smartlead_Tower_Industrial_Outreach.xlsx");
  if (!existsSync(filePath)) {
    console.error(`Workbook not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exitCode = 1;
    return;
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const wb = XLSX.readFile(filePath);
  console.log(`Sheets found: ${wb.SheetNames.join(", ")}`);
  console.log(`Mode: ${commit ? "COMMIT (writing to Supabase)" : "DRY RUN (no writes)"}`);
  for (const name of wb.SheetNames) {
    if (!PROSPECT_SHEETS.has(name)) {
      console.log(`Skipping sheet "${name}": ${SKIPPED_SHEETS_REASON[name] ?? "not recognized as prospect data."}`);
    }
  }
  console.log("");

  // Reload existing leads fresh each pass so this dedupes against both the
  // live DB AND whatever the CSV importer already committed.
  const { data: existingLeads, error: loadErr } = await supabase
    .from("leads")
    .select("id, email, company, name, phone, address, industry, engagement_model, opportunity_ownership, source_url, verification_notes, next_action");
  if (loadErr) {
    console.error("Failed to load existing leads:", loadErr.message);
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

  async function processRow(bucket: Bucket, importRow: ImportRow, dedupeKeyOverride?: string) {
    const dedupeKey = dedupeKeyOverride ?? (importRow.email ?? `${(importRow.company ?? "").toLowerCase()}::${(importRow.name ?? "").toLowerCase()}`);
    if (seenInFile.has(dedupeKey)) {
      results.push({ kind: "duplicate_in_file", bucket });
      return;
    }
    seenInFile.add(dedupeKey);

    const existing = importRow.email
      ? byEmail.get(importRow.email)
      : byCompanyName.get(`${(importRow.company ?? "").toLowerCase()}::${(importRow.name ?? "").toLowerCase()}`);

    if (!existing) {
      results.push({ kind: "inserted", bucket, row: importRow });
      if (commit) {
        const { error } = await supabase.from("leads").insert({
          company: importRow.company, name: importRow.name, email: importRow.email, phone: importRow.phone,
          address: importRow.address, industry: importRow.industry, engagement_model: importRow.engagement_model,
          opportunity_ownership: importRow.opportunity_ownership, source: importRow.source, status: "new",
          source_url: importRow.source_url, verification_notes: importRow.verification_notes,
          next_action: importRow.next_action,
        });
        if (error) { results[results.length - 1] = { kind: "validation_failure", bucket, reason: `Insert failed: ${error.message}` }; }
      }
      return;
    }

    const changed =
      (existing.phone ?? null) !== importRow.phone ||
      (existing.address ?? null) !== importRow.address ||
      (existing.industry ?? null) !== importRow.industry ||
      (existing.source_url ?? null) !== importRow.source_url ||
      (existing.verification_notes ?? null) !== importRow.verification_notes ||
      (existing.next_action ?? null) !== importRow.next_action;

    if (!changed) {
      results.push({ kind: "unchanged", bucket, row: importRow, leadId: existing.id });
      return;
    }
    results.push({ kind: "updated", bucket, row: importRow, leadId: existing.id });
    if (commit) {
      const { error } = await supabase.from("leads").update({
        phone: importRow.phone ?? existing.phone,
        address: importRow.address ?? existing.address,
        industry: importRow.industry ?? existing.industry,
        source_url: importRow.source_url ?? existing.source_url,
        verification_notes: importRow.verification_notes ?? existing.verification_notes,
        next_action: importRow.next_action ?? existing.next_action,
      }).eq("id", existing.id);
      if (error) { results[results.length - 1] = { kind: "validation_failure", bucket, reason: `Update failed: ${error.message}` }; }
    }
  }

  // --- "Verified Leads" sheet: identical shape to the CSV -------------------
  for (const record of sheetRows(wb, "Verified Leads")) {
    const company = record.company_name?.trim() || null;
    const name = [record.first_name, record.last_name].filter((p) => p && p.trim()).join(" ").trim() || null;
    const emailRaw = record.email?.trim() || "";
    const email = emailRaw ? normalizeEmail(emailRaw) : null;
    if (!company && !name) { results.push({ kind: "validation_failure", bucket: "verified", reason: "Missing company and name." }); continue; }
    if (email && !isValidEmail(email)) { results.push({ kind: "validation_failure", bucket: "verified", reason: `Invalid email: "${emailRaw}"` }); continue; }

    const industry = guessIndustry(record.category || "");
    const engagementModel = guessEngagementModel(record.category || "");
    const notesParts = [
      record.personalization?.trim(),
      record.target_role?.trim() ? `Target role: ${record.target_role.trim()}` : "",
      record.last_verified?.trim() ? `Verified as of: ${record.last_verified.trim()}` : "",
    ].filter((p): p is string => !!p);

    await processRow("verified", {
      company, name, email, phone: null, address: record.location?.trim() || null,
      industry: industry && VALID_INDUSTRIES.has(industry) ? industry : null,
      engagement_model: VALID_ENGAGEMENT_MODELS.has(engagementModel) ? engagementModel : "unknown",
      opportunity_ownership: "unknown",
      source_url: record.source_url ? normalizeUrl(record.source_url) : null,
      verification_notes: notesParts.length ? notesParts.join(" | ") : null,
      next_action: null,
      source: "xlsx_import_verified",
    });
  }

  // --- "Research Queue" sheet: company-level, no contact discovered yet -----
  for (const record of sheetRows(wb, "Research Queue")) {
    const company = record.company_name?.trim() || null;
    if (!company) { results.push({ kind: "validation_failure", bucket: "research_needed", reason: "Missing company_name." }); continue; }

    const industry = guessIndustry(record.category || "");
    const engagementModel = guessEngagementModel(record.category || "");
    const address = [record.base?.trim(), record.service_area?.trim()].filter(Boolean).join(" / ") || null;
    const notesParts = [
      record.fit?.trim(),
      record.current_contact_path?.trim() ? `Contact path: ${record.current_contact_path.trim()}` : "",
      record.priority?.trim() ? `Priority: ${record.priority.trim()}` : "",
    ].filter((p): p is string => !!p);

    await processRow("research_needed", {
      company, name: null, email: null, phone: null, address,
      industry: industry && VALID_INDUSTRIES.has(industry) ? industry : null,
      engagement_model: VALID_ENGAGEMENT_MODELS.has(engagementModel) ? engagementModel : "unknown",
      opportunity_ownership: "unknown",
      source_url: record.source_url ? normalizeUrl(record.source_url) : null,
      verification_notes: notesParts.length ? notesParts.join(" | ") : null,
      next_action: record.next_action?.trim() || "Find and verify a contact email",
      source: "xlsx_import_research",
    }, `company::${company.toLowerCase()}`);
  }

  const countFor = (bucket: Bucket, kind: RowResult["kind"]) => results.filter((r) => r.bucket === bucket && r.kind === kind).length;
  const report = {
    verified_imported: countFor("verified", "inserted"),
    verified_unchanged: countFor("verified", "unchanged"),
    verified_updated: countFor("verified", "updated"),
    research_needed_imported: countFor("research_needed", "inserted"),
    research_needed_unchanged: countFor("research_needed", "unchanged"),
    research_needed_updated: countFor("research_needed", "updated"),
    duplicates: results.filter((r) => r.kind === "duplicate_in_file").length,
    validation_failures: results.filter((r) => r.kind === "validation_failure").length,
  };
  console.log("--- Workbook import report ---");
  console.log(JSON.stringify(report, null, 2));

  const failures = results.filter((r): r is Extract<RowResult, { kind: "validation_failure" }> => r.kind === "validation_failure");
  if (failures.length > 0) {
    console.log("\n--- Validation failures ---");
    for (const f of failures) console.log(`- [${f.bucket}] ${f.reason}`);
  }

  if (!commit) console.log("\nDry run complete. No rows were written. Re-run with --commit after reviewing this report.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
