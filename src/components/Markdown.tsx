import type { MdBlock, MdInline } from "@/lib/markdown";

// Renders a block tree from parseMarkdown. A server component that parses
// nothing itself: the page calls parseMarkdown and passes the blocks. Every
// text node is a React child, so React escapes it; no HTML string is ever
// injected.

interface MarkdownProps {
  blocks: MdBlock[];
}

// The page owns the h1, so a body heading renders one level down, capped at h4.
const HEADINGS = {
  1: { Tag: "h2", className: "mt-8 text-xl font-semibold tracking-tight" },
  2: { Tag: "h3", className: "mt-6 text-lg font-semibold tracking-tight" },
  3: { Tag: "h4", className: "mt-5 font-semibold" },
  4: { Tag: "h4", className: "mt-4 text-sm font-semibold" },
} as const;

export function Markdown({ blocks }: MarkdownProps) {
  return (
    <div className="text-sm leading-6 text-neutral-800 dark:text-neutral-200">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}

function Block({ block }: { block: MdBlock }) {
  switch (block.type) {
    case "heading": {
      const { Tag, className } = HEADINGS[block.level];
      return (
        <Tag className={className}>
          <Inlines nodes={block.children} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className="mt-3">
          <Inlines nodes={block.children} />
        </p>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List className={`mt-3 space-y-2 pl-6 ${block.ordered ? "list-decimal" : "list-disc"}`}>
          {block.items.map((item, i) => (
            <li key={i}>
              <Inlines nodes={item} />
            </li>
          ))}
        </List>
      );
    }
    case "blockquote":
      return (
        <blockquote className="mt-3 border-l-2 border-neutral-300 pl-4 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
          <Inlines nodes={block.children} />
        </blockquote>
      );
    case "rule":
      return <hr className="my-6 border-neutral-200 dark:border-neutral-800" />;
    case "code":
      return (
        <figure className="mt-4 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          {block.title && (
            <figcaption className="border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 font-mono text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
              {block.title}
            </figcaption>
          )}
          <pre className="overflow-x-auto bg-neutral-50 p-3 text-xs leading-5 dark:bg-neutral-900">
            <code data-lang={block.lang ?? undefined}>{block.value}</code>
          </pre>
        </figure>
      );
  }
}

function Inlines({ nodes }: { nodes: MdInline[] }) {
  return nodes.map((node, i) => <Inline key={i} node={node} />);
}

function Inline({ node }: { node: MdInline }) {
  switch (node.type) {
    case "text":
      return node.value;
    case "code":
      return (
        <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-neutral-800">
          {node.value}
        </code>
      );
    case "strong":
      return (
        <strong className="font-semibold">
          <Inlines nodes={node.children} />
        </strong>
      );
    case "emphasis":
      return (
        <em>
          <Inlines nodes={node.children} />
        </em>
      );
    case "link": {
      if (node.href === null) return <Inlines nodes={node.children} />;
      const external = node.href.startsWith("http://") || node.href.startsWith("https://");
      return (
        <a
          href={node.href}
          className="underline underline-offset-4"
          {...(external && { target: "_blank", rel: "noopener noreferrer" })}
        >
          <Inlines nodes={node.children} />
        </a>
      );
    }
  }
}
