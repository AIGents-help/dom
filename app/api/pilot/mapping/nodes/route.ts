import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveContractor } from "@/lib/pilotAuth";

const OFFLINE_AFTER_MS = 45_000;

export async function GET(req: NextRequest) {
  const auth = await resolveContractor(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("mapping_workers")
    .select("worker_id, display_name, status, nodeodm_status, docker_status, current_job_id, nodeodm_version, cpu_cores, available_memory, queue_count, last_error, last_seen_at")
    .order("last_seen_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const nodes = (data ?? []).map((node) => {
    const ageMs = now - new Date(node.last_seen_at).getTime();
    const online = Number.isFinite(ageMs) && ageMs <= OFFLINE_AFTER_MS;
    return { ...node, online, status: online ? node.status : "offline", launch_url: "dominic://start-node" };
  });

  return NextResponse.json({
    nodes,
    ready: nodes.some((node) => node.online && node.nodeodm_status === "ready" && ["ready", "processing"].includes(node.status)),
  });
}
