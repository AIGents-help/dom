import type { Metadata } from "next";
import { redirect } from "next/navigation";

// Legacy links now enter through authenticated Client Portal access. A job UUID
// is an identifier, not authorization, so this route never signs files directly.

interface Props {
  params: Promise<{ jobId: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Your Deliverables | Drone Operation Management" };
}

export default async function DeliverablesPage({ params }: Props) {
  const { jobId } = await params;
  redirect(`/client/login?returnTo=${encodeURIComponent(`/client?job=${jobId}`)}`);
}
