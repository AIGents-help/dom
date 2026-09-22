import { getSupabaseAnonServer } from "@/lib/supabaseAnonServer";

export type IndustryPost = {
  id: string;
  content_type: "article" | "event";
  status: "draft" | "published" | "archived";
  category: string;
  title: string;
  slug: string;
  dek: string | null;
  body: string | null;
  pilot_impact: string | null;
  source_name: string | null;
  source_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  registration_url: string | null;
  featured: boolean;
  published_at: string | null;
};

export async function getPublishedIndustryPosts(limit = 20): Promise<IndustryPost[]> {
  try {
    const sb = getSupabaseAnonServer();
    const { data, error } = await sb
      .from("industry_posts")
      .select("id,content_type,status,category,title,slug,dek,body,pilot_impact,source_name,source_url,starts_at,ends_at,location,registration_url,featured,published_at")
      .eq("status", "published")
      .not("published_at", "is", null)
      .order("featured", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(limit);

    if (error) return [];
    return (data ?? []) as IndustryPost[];
  } catch {
    return [];
  }
}

export async function getIndustryPostBySlug(slug: string): Promise<IndustryPost | null> {
  try {
    const sb = getSupabaseAnonServer();
    const { data, error } = await sb
      .from("industry_posts")
      .select("id,content_type,status,category,title,slug,dek,body,pilot_impact,source_name,source_url,starts_at,ends_at,location,registration_url,featured,published_at")
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();

    if (error || !data) return null;
    return data as IndustryPost;
  } catch {
    return null;
  }
}
