import { describe, expect, it } from "vitest";
import { sopMarkdownToHtml } from "./sopMarkdown";

describe("sopMarkdownToHtml", () => {
  it("renders project-owned quality-reference images", () => {
    const html = sopMarkdownToHtml("## Reference\n![Clear aerial sample](/images/construction-aerial.jpg)");
    expect(html).toContain('<img src="/images/construction-aerial.jpg"');
    expect(html).toContain("Clear aerial sample");
  });

  it("does not render remote image URLs", () => {
    expect(sopMarkdownToHtml("![External](https://example.com/image.jpg)")).not.toContain("<img");
  });
});
