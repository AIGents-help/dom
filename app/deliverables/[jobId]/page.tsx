import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

// Public deliverables view — /deliverables/[jobId]. Server Component, same
// trust model this app already uses for /pay/[assignmentId]: an unguessable
// UUID in the URL is the only "auth". Signed Storage URLs are generated
// fresh server-side on every load (short expiry doesn't matter in
// practice), so nothing long-lived ever leaks. Only qc_passed deliverables
// are ever shown — unreviewed uploads stay admin-only.

interface Props {
  params: Promise<{ jobId: string }>;
}

interface DeliverableRow {
  id: string;
  name: string;
  type: string | null;
  storage_url: string | null;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Your Deliverables | Drone Operation Management" };
}

export default async function DeliverablesPage({ params }: Props) {
  const { jobId } = await params;
  const admin = getSupabaseAdmin();

  const { data: job } = await admin
    .from("jobs")
    .select("id, title, service_type, location")
    .eq("id", jobId)
    .maybeSingle();

  const { data: deliverableRows } = job
    ? await admin
        .from("deliverables")
        .select("id, name, type, storage_url")
        .eq("job_id", jobId)
        .eq("qc_passed", true)
        .order("created_at")
    : { data: null as DeliverableRow[] | null };

  const deliverables = deliverableRows ?? [];

  const withSignedUrls = await Promise.all(
    deliverables.map(async (d) => {
      if (!d.storage_url) return { ...d, signedUrl: null as string | null };
      const { data } = await admin.storage.from("mission-deliverables").createSignedUrl(d.storage_url, 3600);
      return { ...d, signedUrl: data?.signedUrl ?? null };
    })
  );

  return (
    <section className="border-b border-border bg-grid-fade">
      <div className="container-app py-24">
        <p className="eyebrow mb-4">Your Deliverables</p>
        <h1 className="heading-xl max-w-2xl">
          {job ? job.title : "Deliverables"}
        </h1>
        {job?.location && <p className="body-muted mt-4">{job.location}</p>}

        {!job || withSignedUrls.length === 0 ? (
          <div className="card mt-10 p-8">
            <p className="body-muted">
              Your deliverables aren&apos;t ready yet. We&apos;ll email you as soon as they&apos;re available.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {withSignedUrls.map((d) => (
              <div key={d.id} className="card p-6">
                <p className="text-sm text-slate-500">{(d.type ?? "").replace(/_/g, " ")}</p>
                <h3 className="mt-1 text-lg font-semibold text-white">{d.name}</h3>
                {d.signedUrl ? (
                  <a href={d.signedUrl} className="btn-primary mt-4 inline-flex">
                    Download →
                  </a>
                ) : (
                  <p className="mt-4 text-sm text-red-400">File unavailable — contact us for help.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
