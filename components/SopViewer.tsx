"use client";

// Renders SOP/tutorial body_md content. This is a small, hand-rolled subset
// renderer (headers, checkbox/bulleted/numbered lists, bold, links,
// paragraphs) rather than a full Markdown library — the content is entirely
// admin-authored (seeded via migration, never user-generated), and the
// actual syntax used across every SOP/tutorial in this app is narrow enough
// that a real dependency isn't worth it. Covers: #/## headers, "- [ ] "
// checkboxes, "- " bullets, "1. " numbered items, **bold**, [label](url)
// links, blank-line-separated paragraphs.

const V = { ground: "#0A0E14", surface: "#11161F", raised: "#161D29", line: "#232C3B", ink: "#E8ECF2", inkDim: "#8A95A7", inkFaint: "#5A6678", signal: "#FF8A3D", telemetry: "#4FD1C5" };

function renderInline(text: string, key: string | number) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return (
    <span key={key}>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} style={{ color: V.ink }}>{part.slice(2, -2)}</strong>;
        }
        const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (linkMatch) {
          return (
            <a key={i} href={linkMatch[2]} target="_blank" rel="noreferrer" style={{ color: V.telemetry }}>
              {linkMatch[1]}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

export default function SopViewer({ bodyMd }: { bodyMd: string }) {
  const lines = bodyMd.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { type: "ul" | "ol" | "check"; items: string[] } | null = null;

  function flushList() {
    if (!list) return;
    if (list.type === "check") {
      blocks.push(
        <ul key={blocks.length} style={{ listStyle: "none", padding: 0, margin: "8px 0", display: "grid", gap: 6 }}>
          {list.items.map((item, i) => (
            <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, color: V.inkDim }}>
              <span style={{ marginTop: 2, flexShrink: 0 }}>☐</span>
              <span>{renderInline(item, i)}</span>
            </li>
          ))}
        </ul>
      );
    } else {
      const Tag = list.type;
      blocks.push(
        <Tag key={blocks.length} style={{ margin: "8px 0", paddingLeft: 22, display: "grid", gap: 6 }}>
          {list.items.map((item, i) => <li key={i} style={{ fontSize: 14, color: V.inkDim }}>{renderInline(item, i)}</li>)}
        </Tag>
      );
    }
    list = null;
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) { flushList(); return; }

    if (trimmed.startsWith("# ")) {
      flushList();
      blocks.push(<h1 key={idx} className="font-saira" style={{ fontSize: 22, fontWeight: 700, marginTop: blocks.length ? 24 : 0 }}>{trimmed.slice(2)}</h1>);
    } else if (trimmed.startsWith("## ")) {
      flushList();
      blocks.push(<h2 key={idx} className="font-mono-ibm" style={{ fontSize: 13, letterSpacing: ".08em", textTransform: "uppercase", color: V.signal, marginTop: 22 }}>{trimmed.slice(3)}</h2>);
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
      blocks.push(
        <div key={idx} style={{ marginTop: 16, padding: 12, borderRadius: 8, background: "rgba(255,138,61,.08)", border: `1px solid ${V.signal}` }}>
          <p style={{ fontSize: 13, color: V.signal, margin: 0 }}>{renderInline(trimmed, idx)}</p>
        </div>
      );
    } else {
      flushList();
      blocks.push(<p key={idx} style={{ fontSize: 14, color: V.inkDim, marginTop: 8, lineHeight: 1.6 }}>{renderInline(trimmed, idx)}</p>);
    }
  });
  flushList();

  return <div>{blocks}</div>;
}
