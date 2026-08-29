import { createReadStream } from "node:fs";
import { google, drive_v3 } from "googleapis";
import { env } from "./env";
import { supabaseAdmin } from "./supabaseClient";

// Google Drive as the heavy-data archive layer (raw imagery, orthomosaic
// masters, point clouds, 3D models, DSM/DTM, reports). Supabase keeps only
// metadata + the small-object paths this worker already writes elsewhere
// (mapping_projects/mapping_processing_jobs/deliverables rows). Entirely
// opt-in: if neither auth mode below is configured, isDriveConfigured() is
// false and every caller in processJob.ts falls back to the original
// Supabase-only path unchanged.
//
// Auth: OAuth 2.0 on behalf of the DOM owner's own Google account is the
// required/primary mode — a bare service account has NO Drive storage
// quota of its own (verified against Google's current Drive API docs), so
// it cannot own files on a personal Google One account the way this
// feature needs. The refresh token is produced once, interactively, by
// scripts/authorizeGoogleDrive.ts (see README) -- never checked into the
// repo, never sent to the browser. A Workspace service account + Shared
// Drive is kept as an optional fallback auth mode for a future enterprise
// setup, used only if the OAuth vars are absent.
export type DriveAuthMode = "oauth_user" | "service_account" | "unconfigured";

export function driveAuthMode(): DriveAuthMode {
  if (env.googleDriveClientId && env.googleDriveClientSecret && env.googleDriveRefreshToken) return "oauth_user";
  if (env.googleDriveClientEmail && env.googleDrivePrivateKey) return "service_account";
  return "unconfigured";
}

export function isDriveConfigured(): boolean {
  return driveAuthMode() !== "unconfigured" && !!env.googleDriveRootParentId;
}

let cachedDrive: drive_v3.Drive | null = null;

function getDrive(): drive_v3.Drive {
  if (cachedDrive) return cachedDrive;

  const mode = driveAuthMode();
  if (mode === "oauth_user") {
    const auth = new google.auth.OAuth2(env.googleDriveClientId, env.googleDriveClientSecret);
    auth.setCredentials({ refresh_token: env.googleDriveRefreshToken });
    cachedDrive = google.drive({ version: "v3", auth });
    return cachedDrive;
  }
  if (mode === "service_account") {
    const auth = new google.auth.JWT({
      email: env.googleDriveClientEmail,
      key: env.googleDrivePrivateKey,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    cachedDrive = google.drive({ version: "v3", auth });
    return cachedDrive;
  }
  throw new Error("Google Drive is not configured — set GOOGLE_DRIVE_CLIENT_ID/GOOGLE_DRIVE_CLIENT_SECRET/GOOGLE_DRIVE_REFRESH_TOKEN (see README).");
}

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// Drive has no unique-name constraint, so "find or create" is the only way
// to avoid duplicates -- this is the actual duplicate-prevention mechanism
// for a single call. Cross-retry duplicate prevention (the "Do not create
// duplicate folders on retries" requirement) is handled one level up, by
// resolveProjectFolders() caching every id it resolves onto
// mapping_projects.drive_folder_ids and checking that cache first.
async function findOrCreateFolder(name: string, parentId: string): Promise<string> {
  const drive = getDrive();
  const q = `name = '${escapeQueryValue(name)}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const list = await drive.files.list({
    q,
    fields: "files(id, name)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    ...(env.googleDriveSharedDriveId ? { corpora: "drive", driveId: env.googleDriveSharedDriveId } : {}),
  });
  const existingId = list.data.files?.[0]?.id;
  if (existingId) return existingId;

  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!created.data.id) throw new Error(`Drive folder creation for "${name}" (parent ${parentId}) did not return an id.`);
  return created.data.id;
}

export async function uploadFile(localPath: string, filename: string, parentId: string): Promise<string> {
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [parentId] },
    media: { body: createReadStream(localPath) },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!res.data.id) throw new Error(`Drive upload of "${filename}" (parent ${parentId}) did not return a file id.`);
  return res.data.id;
}

export interface DriveFolderTree {
  raw_images: string;
  orthomosaic: string;
  point_cloud: string;
  model_3d: string;
  elevation: string;
  reports: string;
}

const SUBFOLDERS: { key: keyof DriveFolderTree; name: string }[] = [
  { key: "raw_images", name: "01_Raw_Images" },
  { key: "orthomosaic", name: "02_Orthomosaic" },
  { key: "point_cloud", name: "03_Point_Cloud" },
  { key: "model_3d", name: "04_3D_Model" },
  { key: "elevation", name: "05_Elevation" },
  { key: "reports", name: "06_Reports" },
];

function sanitizeSegment(name: string): string {
  const trimmed = name.trim().replace(/[/\\]/g, "-");
  return trimmed.length > 0 ? trimmed : "Untitled";
}

// Resolves (creating whatever's missing) the full
// "DOM Drone Operations/Customers/<Customer>/<Job - Date>/0N_*" folder tree
// for a mapping project. Every id resolved along the way is written onto
// mapping_projects.drive_folder_ids immediately (not just at the end), so a
// worker crash or retry mid-tree-walk resumes from the cache instead of
// re-creating folders that already exist.
export async function resolveProjectFolders(projectId: string, customerName: string, jobLabel: string): Promise<DriveFolderTree> {
  const { data: project, error } = await supabaseAdmin.from("mapping_projects").select("drive_folder_ids").eq("id", projectId).single();
  if (error) throw new Error(`Could not load drive_folder_ids for project ${projectId}: ${error.message}`);

  const cache: Record<string, string> = { ...((project?.drive_folder_ids as Record<string, string> | null) ?? {}) };

  async function resolve(name: string, parentId: string): Promise<string> {
    const cacheKey = `${parentId}::${name}`;
    const cached = cache[cacheKey];
    if (cached) return cached;
    const id = await findOrCreateFolder(name, parentId);
    cache[cacheKey] = id;
    await supabaseAdmin.from("mapping_projects").update({ drive_folder_ids: cache }).eq("id", projectId);
    return id;
  }

  const rootId = await resolve("DOM Drone Operations", env.googleDriveRootParentId);
  const customersId = await resolve("Customers", rootId);
  const customerId = await resolve(sanitizeSegment(customerName), customersId);
  const jobId = await resolve(sanitizeSegment(jobLabel), customerId);

  const tree = {} as DriveFolderTree;
  for (const { key, name } of SUBFOLDERS) {
    tree[key] = await resolve(name, jobId);
  }
  return tree;
}
