import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Idea = {
  id: string;
  heading: string;
  question: string | null;
  notes: string | null;
  source_url: string | null;
  category: string;
};

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function responseText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output ?? []) {
    for (const part of item?.content ?? []) {
      if (part?.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  return "";
}

function parseJsonObject(text: string) {
  const cleaned = text.trim().replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/, "");
  return JSON.parse(cleaned);
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  const admin = getSupabaseAdmin();
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Admin session expired." }, { status: 403 });

  let body: { ideaId?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.ideaId) return NextResponse.json({ error: "ideaId is required." }, { status: 400 });

  const { data: idea, error: ideaError } = await admin
    .from("industry_ideas")
    .select("id,heading,question,notes,source_url,category")
    .eq("id", body.ideaId)
    .maybeSingle<Idea>();

  if (ideaError || !idea) return NextResponse.json({ error: ideaError?.message ?? "Idea not found." }, { status: 404 });

  await admin.from("industry_ideas").update({ status: "generating", updated_at: new Date().toISOString() }).eq("id", idea.id);

  const prompt = `
You are the editorial writer for Drone Operation Management (DOM), a commercial drone operations platform serving professional pilots.

Turn the owner-supplied idea below into a useful pilot-facing article draft.

OWNER IDEA
Heading: ${idea.heading}
Question: ${idea.question ?? ""}
Notes: ${idea.notes ?? ""}
Preferred source: ${idea.source_url ?? "none supplied"}
Category: ${idea.category}

EDITORIAL RULES
- Write for FAA Part 107 commercial drone pilots in plain English.
- Be precise and practical, not sensational.
- For regulatory or safety claims, prioritize current official FAA, Federal Register, TSA, NTSB, NASA, or other primary government sources.
- Use web research when needed. Do not rely on stale memory for current rules.
- Clearly separate what is generally allowed, conditionally allowed, and prohibited/requires authorization or waiver.
- Never fabricate a rule, citation, event, source, or URL.
- If a point cannot be verified, omit it or explicitly mark it as needing verification.
- Include a concise "What this means for pilots" section.
- The article must remain a DRAFT for human approval.

Return ONLY valid JSON with these keys:
{
  "title": string,
  "dek": string,
  "body": string,
  "pilot_impact": string,
  "source_name": string,
  "source_url": string
}
`;

  try {
    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.DOM_INDUSTRY_AI_MODEL || "gpt-5.6-terra",
        tools: [{ type: "web_search" }],
        input: prompt,
      }),
    });

    if (!aiResponse.ok) {
      const detail = await aiResponse.text();
      await admin.from("industry_ideas").update({ status: "idea", updated_at: new Date().toISOString() }).eq("id", idea.id);
      return NextResponse.json({ error: `AI generation failed (${aiResponse.status}).`, detail: detail.slice(0, 500) }, { status: 502 });
    }

    const payload = await aiResponse.json();
    const text = responseText(payload);
    const generated = parseJsonObject(text);
    if (!generated.title || !generated.body) throw new Error("AI response did not contain a usable article.");

    const baseSlug = slugify(generated.title);
    const suffix = Math.random().toString(36).slice(2, 7);
    const { data: post, error: postError } = await admin
      .from("industry_posts")
      .insert({
        content_type: "article",
        status: "draft",
        category: idea.category,
        title: generated.title,
        slug: `${baseSlug}-${suffix}`,
        dek: generated.dek || null,
        body: generated.body,
        pilot_impact: generated.pilot_impact || null,
        source_name: generated.source_name || null,
        source_url: generated.source_url || idea.source_url || null,
        featured: false,
        generated_by_ai: true,
        generated_from_idea_id: idea.id,
      })
      .select("id,slug")
      .single();

    if (postError || !post) throw new Error(postError?.message ?? "Could not save generated draft.");

    await admin.from("industry_ideas").update({
      status: "draft_created",
      generated_post_id: post.id,
      updated_at: new Date().toISOString(),
    }).eq("id", idea.id);

    return NextResponse.json({ success: true, post });
  } catch (error) {
    await admin.from("industry_ideas").update({ status: "idea", updated_at: new Date().toISOString() }).eq("id", idea.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI generation failed." }, { status: 500 });
  }
}
