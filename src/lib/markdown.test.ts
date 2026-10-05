import { describe, expect, it } from "vitest";
import { type MdInline, parseMarkdown } from "./markdown";

const text = (value: string): MdInline => ({ type: "text", value });

// The inline nodes of a one-paragraph document.
function inline(source: string): MdInline[] {
  const [block] = parseMarkdown(source);
  if (block?.type !== "paragraph") throw new Error(`not a paragraph: ${source}`);
  return block.children;
}

describe("parseMarkdown blocks", () => {
  it("parses headings one to four, and keeps ##### as a paragraph", () => {
    expect(parseMarkdown("# One\n## Two\n### Three\n#### Four\n##### Five")).toEqual([
      { type: "heading", level: 1, children: [text("One")] },
      { type: "heading", level: 2, children: [text("Two")] },
      { type: "heading", level: 3, children: [text("Three")] },
      { type: "heading", level: 4, children: [text("Four")] },
      { type: "paragraph", children: [text("##### Five")] },
    ]);
  });

  it("joins a paragraph spanning lines and splits paragraphs at blank lines", () => {
    expect(parseMarkdown("First line\nsecond line.\n\nNext.")).toEqual([
      { type: "paragraph", children: [text("First line second line.")] },
      { type: "paragraph", children: [text("Next.")] },
    ]);
  });

  it("parses a fence with lang and title, keeping its content verbatim", () => {
    const source =
      '```tsx title="app/page.tsx"\n# not a heading\n- not a list\n**not strong**\n```';
    expect(parseMarkdown(source)).toEqual([
      {
        type: "code",
        lang: "tsx",
        title: "app/page.tsx",
        value: "# not a heading\n- not a list\n**not strong**",
      },
    ]);
  });

  it("parses a bare fence without lang or title", () => {
    expect(parseMarkdown("```\nx\n```\nAfter.")).toEqual([
      { type: "code", lang: null, title: null, value: "x" },
      { type: "paragraph", children: [text("After.")] },
    ]);
  });

  it("runs an unclosed fence to the end of the input", () => {
    expect(parseMarkdown("```ts\nconst a = 1;\n\nconst b = 2;")).toEqual([
      { type: "code", lang: "ts", title: null, value: "const a = 1;\n\nconst b = 2;" },
    ]);
  });

  it("parses an unordered list with a continuation line", () => {
    expect(parseMarkdown("- one\n  continued\n* two\n\nAfter.")).toEqual([
      { type: "list", ordered: false, items: [[text("one continued")], [text("two")]] },
      { type: "paragraph", children: [text("After.")] },
    ]);
  });

  it("parses an ordered list with a continuation line", () => {
    expect(parseMarkdown("1. one\n2. two\n   more\n10. ten")).toEqual([
      {
        type: "list",
        ordered: true,
        items: [[text("one")], [text("two more")], [text("ten")]],
      },
    ]);
  });

  it("ends a paragraph at a list, a heading or a fence", () => {
    expect(parseMarkdown("Intro:\n- item\n## H\nText\n```\ncode\n```")).toEqual([
      { type: "paragraph", children: [text("Intro:")] },
      { type: "list", ordered: false, items: [[text("item")]] },
      { type: "heading", level: 2, children: [text("H")] },
      { type: "paragraph", children: [text("Text")] },
      { type: "code", lang: null, title: null, value: "code" },
    ]);
  });

  it("parses a blockquote over several lines", () => {
    expect(parseMarkdown("> quoted\n> **more**")).toEqual([
      {
        type: "blockquote",
        children: [text("quoted "), { type: "strong", children: [text("more")] }],
      },
    ]);
  });

  it("parses a thematic break", () => {
    expect(parseMarkdown("Above\n\n---\n\nBelow")).toEqual([
      { type: "paragraph", children: [text("Above")] },
      { type: "rule" },
      { type: "paragraph", children: [text("Below")] },
    ]);
  });

  it("accepts Windows line endings", () => {
    expect(parseMarkdown("# H\r\n\r\nText")).toEqual([
      { type: "heading", level: 1, children: [text("H")] },
      { type: "paragraph", children: [text("Text")] },
    ]);
  });
});

describe("parseMarkdown inline", () => {
  it("keeps a code span verbatim", () => {
    expect(inline("Call `a * b` now")).toEqual([
      text("Call "),
      { type: "code", value: "a * b" },
      text(" now"),
    ]);
  });

  it("parses strong and emphasis with both markers", () => {
    expect(inline("**bold**, *it* and _also_")).toEqual([
      { type: "strong", children: [text("bold")] },
      text(", "),
      { type: "emphasis", children: [text("it")] },
      text(" and "),
      { type: "emphasis", children: [text("also")] },
    ]);
  });

  it("nests emphasis in strong", () => {
    expect(inline("**a *b* c**")).toEqual([
      {
        type: "strong",
        children: [text("a "), { type: "emphasis", children: [text("b")] }, text(" c")],
      },
    ]);
  });

  it("parses a link with inline children", () => {
    expect(inline("See [the `docs`](https://example.com/x).")).toEqual([
      text("See "),
      {
        type: "link",
        href: "https://example.com/x",
        children: [text("the "), { type: "code", value: "docs" }],
      },
      text("."),
    ]);
  });

  it.each(["/skills", "#steps", "http://example.com"])("keeps the href %s", (href) => {
    expect(inline(`[x](${href})`)).toEqual([{ type: "link", href, children: [text("x")] }]);
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "relative/path"])(
    "drops the href %s",
    (href) => {
      expect(inline(`[x](${href})`)[0]).toEqual({
        type: "link",
        href: null,
        children: [text("x")],
      });
    },
  );

  it("keeps unmatched markers as text", () => {
    expect(inline("a * b, `tick, **open and [x]")).toEqual([text("a * b, `tick, **open and [x]")]);
  });

  it("does not read underscores inside a word as emphasis", () => {
    expect(inline("snake_case_word")).toEqual([text("snake_case_word")]);
  });
});
