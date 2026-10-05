// A small markdown parser for skill bodies. Pure (a string in, a typed tree
// out): it never produces an HTML string, so the renderer (Markdown.tsx) maps
// plain values to React elements and React escapes every text node.
//
// The grammar is deliberately small: headings (# to ####), paragraphs, fenced
// code (with a language and an optional title="..."), flat ordered and
// unordered lists, blockquotes and thematic breaks; inline code spans,
// **strong**, *emphasis* / _emphasis_ and [links](href). Anything else is
// text. Every change to the grammar goes with a test case in markdown.test.ts.

export type MdInline =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong"; children: MdInline[] }
  | { type: "emphasis"; children: MdInline[] }
  | { type: "link"; href: string | null; children: MdInline[] };

export type MdBlock =
  | { type: "heading"; level: 1 | 2 | 3 | 4; children: MdInline[] }
  | { type: "paragraph"; children: MdInline[] }
  | { type: "code"; lang: string | null; title: string | null; value: string }
  | { type: "list"; ordered: boolean; items: MdInline[][] }
  | { type: "blockquote"; children: MdInline[] }
  | { type: "rule" };

const FENCE = "```";
const HEADING = /^(#{1,4}) (.+)$/;
const ORDERED_ITEM = /^\d+\. /;
const TITLE = /title="([^"]*)"/;
const WORD_CHAR = /[A-Za-z0-9]/;
const SAFE_HREF = ["https://", "http://", "/", "#"];

function unorderedItem(line: string): boolean {
  return line.startsWith("- ") || line.startsWith("* ");
}

function startsBlock(line: string): boolean {
  return (
    line.startsWith(FENCE) ||
    HEADING.test(line) ||
    line.trim() === "---" ||
    line.startsWith(">") ||
    unorderedItem(line) ||
    ORDERED_ITEM.test(line)
  );
}

/** Keeps an href only when it is http(s), root relative or a fragment. */
function safeHref(href: string): string | null {
  return SAFE_HREF.some((prefix) => href.startsWith(prefix)) ? href : null;
}

// charAt answers "" outside the string, which is not a word character.
function isWordChar(char: string): boolean {
  return WORD_CHAR.test(char);
}

/** Parses one line (or joined lines) of inline markdown. */
function parseInline(source: string): MdInline[] {
  const nodes: MdInline[] = [];
  let text = "";
  const flush = () => {
    if (text !== "") nodes.push({ type: "text", value: text });
    text = "";
  };

  let i = 0;
  while (i < source.length) {
    const char = source.charAt(i);

    if (char === "`") {
      const close = source.indexOf("`", i + 1);
      if (close > i + 1) {
        flush();
        nodes.push({ type: "code", value: source.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }

    if (source.startsWith("**", i)) {
      const close = source.indexOf("**", i + 2);
      if (close > i + 2) {
        flush();
        nodes.push({ type: "strong", children: parseInline(source.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
      text += "**";
      i += 2;
      continue;
    }

    if (char === "*" || (char === "_" && !isWordChar(source.charAt(i - 1)))) {
      const close = source.indexOf(char, i + 1);
      const inner = close === -1 ? "" : source.slice(i + 1, close);
      const closesWord = char === "*" || !isWordChar(source.charAt(close + 1));
      if (inner !== "" && inner.trim() === inner && closesWord) {
        flush();
        nodes.push({ type: "emphasis", children: parseInline(inner) });
        i = close + 1;
        continue;
      }
    }

    if (char === "[") {
      const middle = source.indexOf("](", i + 1);
      const close = middle === -1 ? -1 : source.indexOf(")", middle + 2);
      if (middle > i + 1 && close !== -1) {
        flush();
        nodes.push({
          type: "link",
          href: safeHref(source.slice(middle + 2, close).trim()),
          children: parseInline(source.slice(i + 1, middle)),
        });
        i = close + 1;
        continue;
      }
    }

    text += char;
    i += 1;
  }

  flush();
  return nodes;
}

/** Parses a markdown document into blocks. */
export function parseMarkdown(source: string): MdBlock[] {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    if (line.startsWith(FENCE)) {
      const info = line.slice(FENCE.length).trim();
      const lang = info.split(" ")[0] ?? "";
      const body: string[] = [];
      i += 1;
      while (i < lines.length && lines[i] !== FENCE) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      blocks.push({
        type: "code",
        lang: lang === "" || lang.startsWith("title=") ? null : lang,
        title: TITLE.exec(info)?.[1] ?? null,
        value: body.join("\n"),
      });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = (heading[1] ?? "#").length as 1 | 2 | 3 | 4;
      blocks.push({ type: "heading", level, children: parseInline((heading[2] ?? "").trim()) });
      i += 1;
      continue;
    }

    if (line.trim() === "---") {
      blocks.push({ type: "rule" });
      i += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const quoted: string[] = [];
      while (i < lines.length && (lines[i] ?? "").startsWith(">")) {
        quoted.push((lines[i] ?? "").slice(1).trim());
        i += 1;
      }
      blocks.push({ type: "blockquote", children: parseInline(quoted.join(" ").trim()) });
      continue;
    }

    const ordered = ORDERED_ITEM.test(line);
    if (ordered || unorderedItem(line)) {
      const isItem = ordered ? (l: string) => ORDERED_ITEM.test(l) : unorderedItem;
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i] ?? "";
        if (isItem(current)) {
          items.push(current.slice(current.indexOf(" ") + 1).trim());
        } else if (current.startsWith(" ") && current.trim() !== "" && items.length > 0) {
          items[items.length - 1] += ` ${current.trim()}`;
        } else {
          break;
        }
        i += 1;
      }
      blocks.push({ type: "list", ordered, items: items.map(parseInline) });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? "";
      if (current.trim() === "" || (paragraph.length > 0 && startsBlock(current))) break;
      paragraph.push(current.trim());
      i += 1;
    }
    blocks.push({ type: "paragraph", children: parseInline(paragraph.join(" ")) });
  }

  return blocks;
}
