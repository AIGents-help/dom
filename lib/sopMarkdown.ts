// Converts SOP body_md content to an HTML string. This is a small,
// hand-rolled subset renderer (headers, checkbox/bulleted/numbered lists,
// bold, paragraphs, a highlighted "**Gate:**" callout) rather than a full
// Markdown library — the content is entirely admin-authored (seeded via
// migration, never user-generated), and the syntax used across every SOP
// in this app is narrow enough that a real dependency isn't worth it.
// Shared by the in-app dashboard viewer and the print/download window so
// there's exactly one place that understands this syntax.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(text: string): string {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

export function sopMarkdownToHtml(bodyMd: string): string {
  const lines = bodyMd.split("\n");
  const blocks: string[] = [];
  let list: { type: "ul" | "ol" | "check"; items: string[] } | null = null;

  function flushList() {
    if (!list) return;
    if (list.type === "check") {
      blocks.push(`<ul class="check-list">${list.items.map((i) => `<li><span class="box">☐</span><span>${renderInline(i)}</span></li>`).join("")}</ul>`);
    } else {
      const tag = list.type;
      blocks.push(`<${tag}>${list.items.map((i) => `<li>${renderInline(i)}</li>`).join("")}</${tag}>`);
    }
    list = null;
  }

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) { flushList(); continue; }

    if (trimmed.startsWith("# ")) {
      flushList();
      blocks.push(`<h1>${renderInline(trimmed.slice(2))}</h1>`);
    } else if (trimmed.startsWith("## ")) {
      flushList();
      blocks.push(`<h2>${renderInline(trimmed.slice(3))}</h2>`);
    } else if (/^- \[ \] /.test(trimmed)) {
      if (!list || list.type !== "check") { flushList(); list = { type: "check", items: [] }; }
      list.items.push(trimmed.replace(/^- \[ \] /, ""));
    } else if (/^\d+\. /.test(trimmed)) {
      if (!list || list.type !== "ol") { flushList(); list = { type: "ol", items: [] }; }
      list.items.push(trimmed.replace(/^\d+\. /, ""));
    } else if (trimmed.startsWith("- ")) {
      if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; }
      list.items.push(trimmed.slice(2));
    } else if (trimmed.startsWith("**Gate:**")) {
      flushList();
      blocks.push(`<div class="gate">${renderInline(trimmed)}</div>`);
    } else {
      flushList();
      blocks.push(`<p>${renderInline(trimmed)}</p>`);
    }
  }
  flushList();

  return blocks.join("\n");
}
