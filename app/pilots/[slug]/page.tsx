import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import PublicQuoteWizard from "@/components/PublicQuoteWizard";

// Public pilot profile — /pilots/[slug]. Server Component (not client) since
// this is public marketing content and benefits from SEO metadata, unlike
// the rest of the pilot-facing app which is all client-rendered dashboard.
//
// A page is only ever rendered here when the pilot is fully eligible —
// subscribed, verified, and has chosen to publish. That mirrors the exact
// gate PilotPublicProfileEditor shows the pilot in their dashboard, and is
// re-checked here independently (not trusted from anywhere client-side).

interface Props {
  params: Promise<{ slug: string }>;
}

interface PilotRow {
  id: string;
  full_name: string;
  tagline: string | null;
  bio: string | null;
  photo_url: string | null;
  website_url: string | null;
  service_area: string | null;
  equipment: string | null;
  rating: number | null;
}

async function getEligiblePilot(slug: string): Promise<PilotRow | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("contractors")
    .select("id, full_name, tagline, bio, photo_url, website_url, service_area, equipment, rating, part107_verified, insurance_verified, subscription_active, profile_published")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return null;
  if (!(data.profile_published && data.subscription_active && data.part107_verified && data.insurance_verified)) {
    return null;
  }
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pilot = await getEligiblePilot(slug);
  if (!pilot) return { title: "Pilot not found | Drone Operation Management" };
  return {
    title: `${pilot.full_name} | DOM Certified Drone Pilot`,
    description: pilot.tagline ?? `${pilot.full_name} is an FAA Part 107 certified drone pilot on the Drone Operation Management network.`,
  };
}

export default async function PilotProfilePage({ params }: Props) {
  const { slug } = await params;
  const pilot = await getEligiblePilot(slug);
  if (!pilot) notFound();

  const admin = getSupabaseAdmin();
  const { data: portfolio } = await admin
    .from("contractor_portfolio_images")
    .select("id, image_url, caption")
    .eq("contractor_id", pilot.id)
    .order("sort_order");

  const firstName = pilot.full_name.split(" ")[0];

  return (
    <>
      <section className="relative overflow-hidden border-b border-border bg-grid-fade">
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
        <div className="container-app relative py-24">
          <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left">
            {pilot.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pilot.photo_url} alt={pilot.full_name} className="h-28 w-28 flex-none rounded-2xl object-cover" />
            )}
            <div>
              <p className="eyebrow mb-2">DOM Certified Pilot</p>
              <h1 className="heading-xl">{pilot.full_name}</h1>
              {pilot.tagline && <p className="body-muted mt-4 max-w-2xl text-lg">{pilot.tagline}</p>}
              <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
                <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">✓ Part 107 Certified</span>
                <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">✓ Insured</span>
                {pilot.service_area && (
                  <span className="rounded-full border border-border px-3 py-1 text-xs text-slate-300">{pilot.service_area}</span>
                )}
                {pilot.rating != null && (
                  <span className="rounded-full border border-border px-3 py-1 text-xs text-slate-300">{pilot.rating}/5.0</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {(pilot.bio || pilot.equipment || pilot.website_url) && (
        <section className="section">
          <div className="container-app max-w-3xl">
            {pilot.bio && <p className="body-muted whitespace-pre-line text-lg">{pilot.bio}</p>}
            {pilot.equipment && (
              <p className="body-muted mt-4">
                <span className="font-semibold text-white">Equipment: </span>
                {pilot.equipment}
              </p>
            )}
            {pilot.website_url && (
              <a href={pilot.website_url} target="_blank" rel="noreferrer" className="btn-secondary mt-6 inline-flex">
                Visit website →
              </a>
            )}
          </div>
        </section>
      )}

      {portfolio && portfolio.length > 0 && (
        <section className="section border-t border-border">
          <div className="container-app">
            <p className="eyebrow mb-6">Portfolio</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {portfolio.map((img) => (
                <div key={img.id} className="card overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.image_url} alt={img.caption ?? ""} className="h-56 w-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section border-t border-border">
        <div className="container-app max-w-2xl">
          <p className="eyebrow mb-4">Request This Pilot</p>
          <h2 className="heading-lg mb-6">Book {firstName} for your project.</h2>
          <PublicQuoteWizard requestedContractorId={pilot.id} requestedPilotName={firstName} />
        </div>
      </section>
    </>
  );
}
