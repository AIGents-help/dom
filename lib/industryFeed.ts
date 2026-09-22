export type IndustryItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl: string;
  publishedAt: string | null;
  category: "FAA & Regulation" | "Operations" | "Technology" | "Safety" | "Business";
};

const FAA_RSS_URL = "https://www.faa.gov/newsroom/press_releases/rss";

const uasKeywords = [
  "drone",
  "drones",
  "uas",
  "unmanned",
  "remote pilot",
  "remotely-piloted",
  "beyond program",
  "bvlos",
  "counter-drone",
  "airspace restriction",
];

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanHtml(value: string) {
  return decodeXml(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? cleanHtml(match[1]) : "";
}

function classify(title: string, summary: string): IndustryItem["category"] {
  const haystack = `${title} ${summary}`.toLowerCase();
  if (/rule|regulation|fine|enforcement|restriction|authorization|certificate/.test(haystack)) return "FAA & Regulation";
  if (/safety|counter-drone|tfr|security/.test(haystack)) return "Safety";
  if (/test|technology|innovation|hybrid-electric|integration|program/.test(haystack)) return "Technology";
  if (/commercial|operator|business|delivery|cargo/.test(haystack)) return "Business";
  return "Operations";
}

export async function getIndustryFeed(): Promise<IndustryItem[]> {
  try {
    const response = await fetch(FAA_RSS_URL, {
      next: { revalidate: 3600 },
      headers: { "User-Agent": "Drone Operation Management Industry Center/1.0" },
    });

    if (!response.ok) throw new Error(`FAA RSS request failed: ${response.status}`);

    const xml = await response.text();
    const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];

    return blocks
      .map((block, index) => {
        const title = xmlTag(block, "title");
        const summary = xmlTag(block, "description");
        const sourceUrl = xmlTag(block, "link");
        const publishedRaw = xmlTag(block, "pubDate");
        const haystack = `${title} ${summary}`.toLowerCase();

        if (!title || !sourceUrl || !uasKeywords.some((keyword) => haystack.includes(keyword))) return null;

        const publishedAt = publishedRaw && !Number.isNaN(Date.parse(publishedRaw))
          ? new Date(publishedRaw).toISOString()
          : null;

        return {
          id: sourceUrl || `faa-${index}`,
          title,
          summary: summary || "Open the official FAA source for details.",
          source: "Federal Aviation Administration",
          sourceUrl,
          publishedAt,
          category: classify(title, summary),
        } satisfies IndustryItem;
      })
      .filter((item): item is IndustryItem => Boolean(item))
      .slice(0, 12);
  } catch {
    return [];
  }
}

export const industrySources = [
  {
    name: "FAA Press Releases",
    description: "Official FAA announcements, enforcement actions, integration programs, and rule-related notices.",
    href: "https://www.faa.gov/newsroom/press_releases",
  },
  {
    name: "FAA Drones",
    description: "Primary FAA hub for commercial operators, Remote ID, waivers, airspace, and operational guidance.",
    href: "https://www.faa.gov/uas",
  },
  {
    name: "Federal Register",
    description: "Primary federal source for proposed and final rules that may affect UAS operators.",
    href: "https://www.federalregister.gov/",
  },
  {
    name: "FAA UAS Events",
    description: "FAA events, outreach, webinars, and safety education relevant to drone pilots.",
    href: "https://www.faa.gov/uas/events",
  },
] as const;
