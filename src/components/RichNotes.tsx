import { type ReactNode, useId, useRef, useState } from "react";
import {
  Bold,
  Code,
  Eye,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
} from "lucide-react";
import { LinkedText, type RecordReferenceTarget } from "./LinkedText";

type RichNoteBlock =
  | { type: "paragraph"; lines: string[] }
  | { type: "heading"; level: number; text: string }
  | { type: "blockquote"; lines: string[] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

type MarkdownNotesEditorProps = {
  autoFocus?: boolean;
  className?: string;
  label: string;
  textareaClassName?: string;
  value: string;
  onChange: (value: string) => void;
};

type RichNoteTextProps = {
  className?: string;
  emptyText?: string;
  text: string;
  onRecordOpen?: (target: RecordReferenceTarget) => void;
};

const inlineMarkdownPattern =
  /(`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)(?:(?:00|\s)*#[^)]*?00)?|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_)/g;
const leakedMarkdownFragmentPattern = /^(?:00|\s)*(#[\s\S]*?)(?:00|\s)*$/;
const splitLeakedSlideFragmentPattern =
  /(\]\(https?:\/\/[^\s)]+\))(?:00|\s)*#slide=([A-Za-z0-9._-]+)\s+([A-Za-z0-9._-]*?)00(?=\s|$|[).,;!?])/g;

function normalizeLeakedMarkdownFragments(text: string) {
  return text.replace(
    splitLeakedSlideFragmentPattern,
    (_match, linkEnd: string, fragmentStart: string, fragmentEnd: string) =>
      `${linkEnd}00#slide=${fragmentStart}${fragmentEnd}00`,
  );
}

function parseNoteBlocks(text: string) {
  const blocks: RichNoteBlock[] = [];
  const paragraphLines: string[] = [];
  let listBlock: Extract<RichNoteBlock, { type: "ul" | "ol" }> | null = null;
  let quoteLines: string[] = [];

  function flushParagraph() {
    if (!paragraphLines.length) return;
    blocks.push({ type: "paragraph", lines: [...paragraphLines] });
    paragraphLines.length = 0;
  }

  function flushList() {
    if (!listBlock) return;
    blocks.push(listBlock);
    listBlock = null;
  }

  function flushQuote() {
    if (!quoteLines.length) return;
    blocks.push({ type: "blockquote", lines: [...quoteLines] });
    quoteLines = [];
  }

  function flushOpenBlocks() {
    flushParagraph();
    flushList();
    flushQuote();
  }

  for (const rawLine of normalizeLeakedMarkdownFragments(text).replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      flushOpenBlocks();
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      flushOpenBlocks();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      continue;
    }

    const quoteMatch = /^>\s?(.*)$/.exec(line);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      quoteLines.push(quoteMatch[1]);
      continue;
    }

    const unorderedMatch = /^\s*[-*]\s+(.+)$/.exec(line);
    if (unorderedMatch) {
      flushParagraph();
      flushQuote();
      if (!listBlock || listBlock.type !== "ul") {
        flushList();
        listBlock = { type: "ul", items: [] };
      }
      listBlock.items.push(unorderedMatch[1]);
      continue;
    }

    const orderedMatch = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (orderedMatch) {
      flushParagraph();
      flushQuote();
      if (!listBlock || listBlock.type !== "ol") {
        flushList();
        listBlock = { type: "ol", items: [] };
      }
      listBlock.items.push(orderedMatch[1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraphLines.push(line);
  }

  flushOpenBlocks();
  return blocks;
}

function renderLinkedText(
  text: string,
  key: string,
  onRecordOpen?: (target: RecordReferenceTarget) => void,
) {
  return <LinkedText key={key} text={text} onRecordOpen={onRecordOpen} />;
}

function recoverMarkdownHref(rawMarkdownLink: string, href: string) {
  const hrefIndex = rawMarkdownLink.indexOf(href);
  if (hrefIndex === -1) return href;

  const hrefClosingIndex = rawMarkdownLink.indexOf(")", hrefIndex + href.length);
  if (hrefClosingIndex === -1) return href;

  const suffix = rawMarkdownLink.slice(hrefClosingIndex + 1);
  const leakedFragment = leakedMarkdownFragmentPattern.exec(suffix);
  return leakedFragment ? `${href}${leakedFragment[1].replace(/\s+/g, "")}` : href;
}

function renderInlineMarkdown(
  text: string,
  keyPrefix: string,
  onRecordOpen?: (target: RecordReferenceTarget) => void,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(inlineMarkdownPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(
        renderLinkedText(text.slice(cursor, index), `${keyPrefix}-text-${cursor}`, onRecordOpen),
      );
    }

    if (match[2]) {
      nodes.push(
        <code key={`${keyPrefix}-code-${index}`} className="rich-note-inline-code">
          {match[2]}
        </code>,
      );
    } else if (match[3] && match[4]) {
      const href = recoverMarkdownHref(match[0], match[4]);
      nodes.push(
        <a
          className="inline-text-link"
          href={href}
          key={`${keyPrefix}-link-${index}`}
          rel="noreferrer"
          target="_blank"
        >
          {renderInlineMarkdown(match[3], `${keyPrefix}-link-label-${index}`)}
        </a>,
      );
    } else if (match[5] || match[6]) {
      const content = match[5] ?? match[6] ?? "";
      nodes.push(
        <strong key={`${keyPrefix}-strong-${index}`}>
          {renderInlineMarkdown(content, `${keyPrefix}-strong-content-${index}`, onRecordOpen)}
        </strong>,
      );
    } else if (match[7] || match[8]) {
      const content = match[7] ?? match[8] ?? "";
      nodes.push(
        <em key={`${keyPrefix}-em-${index}`}>
          {renderInlineMarkdown(content, `${keyPrefix}-em-content-${index}`, onRecordOpen)}
        </em>,
      );
    }

    cursor = index + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push(renderLinkedText(text.slice(cursor), `${keyPrefix}-text-${cursor}`, onRecordOpen));
  }

  return nodes.length > 0 ? nodes : [text];
}

function renderLines(
  lines: string[],
  keyPrefix: string,
  onRecordOpen?: (target: RecordReferenceTarget) => void,
) {
  return lines.flatMap((line, index) => {
    const nodes = renderInlineMarkdown(line, `${keyPrefix}-line-${index}`, onRecordOpen);
    if (index === lines.length - 1) return nodes;
    return [...nodes, <br key={`${keyPrefix}-break-${index}`} />];
  });
}

function renderBlock(
  block: RichNoteBlock,
  index: number,
  onRecordOpen?: (target: RecordReferenceTarget) => void,
) {
  if (block.type === "heading") {
    const HeadingTag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
    return (
      <HeadingTag className="rich-note-heading" key={`heading-${index}`}>
        {renderInlineMarkdown(block.text, `heading-${index}`, onRecordOpen)}
      </HeadingTag>
    );
  }

  if (block.type === "blockquote") {
    return (
      <blockquote key={`quote-${index}`}>
        {renderLines(block.lines, `quote-${index}`, onRecordOpen)}
      </blockquote>
    );
  }

  if (block.type === "ul" || block.type === "ol") {
    const ListTag = block.type;
    return (
      <ListTag key={`${block.type}-${index}`}>
        {block.items.map((item, itemIndex) => (
          <li key={`${block.type}-${index}-${itemIndex}`}>
            {renderInlineMarkdown(item, `${block.type}-${index}-${itemIndex}`, onRecordOpen)}
          </li>
        ))}
      </ListTag>
    );
  }

  return (
    <p key={`paragraph-${index}`}>
      {renderLines(block.lines, `paragraph-${index}`, onRecordOpen)}
    </p>
  );
}

function scheduleSelectionUpdate(callback: () => void) {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
  } else {
    setTimeout(callback, 0);
  }
}

function selectedLineRange(value: string, selectionStart: number, selectionEnd: number) {
  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const nextBreak = value.indexOf("\n", selectionEnd);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  return { lineStart, lineEnd };
}

export function RichNoteText({
  className = "",
  emptyText = "No notes",
  text,
  onRecordOpen,
}: RichNoteTextProps) {
  const blocks = parseNoteBlocks(text);
  const classes = ["rich-note-text", className].filter(Boolean).join(" ");

  if (!text.trim()) {
    return (
      <div className={`${classes} muted`}>
        <p>{emptyText}</p>
      </div>
    );
  }

  return (
    <div className={classes}>
      {blocks.map((block, index) => renderBlock(block, index, onRecordOpen))}
    </div>
  );
}

export function MarkdownNotesEditor({
  autoFocus = false,
  className = "",
  label,
  textareaClassName = "",
  value,
  onChange,
}: MarkdownNotesEditorProps) {
  const textareaId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  function replaceRange(nextValue: string, selectionStart: number, selectionEnd: number) {
    onChange(nextValue);
    scheduleSelectionUpdate(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function wrapSelection(prefix: string, suffix: string, placeholder: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.slice(start, end) || placeholder;
    const insertedText = `${prefix}${selectedText}${suffix}`;
    replaceRange(
      `${value.slice(0, start)}${insertedText}${value.slice(end)}`,
      start + prefix.length,
      start + prefix.length + selectedText.length,
    );
  }

  function applyLinePrefix(prefix: string, placeholder: string, ordered = false) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start === end) {
      const insertedText = `${prefix}${placeholder}`;
      replaceRange(
        `${value.slice(0, start)}${insertedText}${value.slice(end)}`,
        start + prefix.length,
        start + insertedText.length,
      );
      return;
    }

    const { lineStart, lineEnd } = selectedLineRange(value, start, end);
    const selectedLines = value.slice(lineStart, lineEnd).split("\n");
    const prefixedLines = selectedLines.map((line, index) => {
      if (!line.trim()) return line;
      return `${ordered ? `${index + 1}. ` : prefix}${line.replace(/^\s*([-*]|\d+[.)]|>)\s+/, "")}`;
    });
    const insertedText = prefixedLines.join("\n");
    replaceRange(
      `${value.slice(0, lineStart)}${insertedText}${value.slice(lineEnd)}`,
      lineStart,
      lineStart + insertedText.length,
    );
  }

  function applyLink() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.slice(start, end);
    const normalizedSelectedText = selectedText.trim().replace(/\s+/g, "");
    const looksLikeUrl = /^https?:\/\//i.test(normalizedSelectedText);
    const insertedText = looksLikeUrl
      ? `[Link](${normalizedSelectedText})`
      : `[${selectedText || "Link text"}](https://example.com)`;
    const selectionOffset = looksLikeUrl ? insertedText.length : 1;
    const selectionEnd = looksLikeUrl
      ? insertedText.length
      : selectionOffset + (selectedText || "Link text").length;

    replaceRange(
      `${value.slice(0, start)}${insertedText}${value.slice(end)}`,
      start + selectionOffset,
      start + selectionEnd,
    );
  }

  const toolbarButtons = [
    {
      label: "Heading",
      title: "Heading",
      icon: <Heading2 aria-hidden="true" size={16} />,
      onClick: () => applyLinePrefix("## ", "Heading"),
    },
    {
      label: "Bold",
      title: "Bold",
      icon: <Bold aria-hidden="true" size={16} />,
      onClick: () => wrapSelection("**", "**", "important"),
    },
    {
      label: "Italic",
      title: "Italic",
      icon: <Italic aria-hidden="true" size={16} />,
      onClick: () => wrapSelection("*", "*", "emphasis"),
    },
    {
      label: "Bulleted list",
      title: "Bulleted list",
      icon: <List aria-hidden="true" size={16} />,
      onClick: () => applyLinePrefix("- ", "List item"),
    },
    {
      label: "Numbered list",
      title: "Numbered list",
      icon: <ListOrdered aria-hidden="true" size={16} />,
      onClick: () => applyLinePrefix("1. ", "List item", true),
    },
    {
      label: "Quote",
      title: "Quote",
      icon: <Quote aria-hidden="true" size={16} />,
      onClick: () => applyLinePrefix("> ", "Quoted note"),
    },
    {
      label: "Code",
      title: "Inline code",
      icon: <Code aria-hidden="true" size={16} />,
      onClick: () => wrapSelection("`", "`", "code"),
    },
    {
      label: "Link",
      title: "Link",
      icon: <LinkIcon aria-hidden="true" size={16} />,
      onClick: applyLink,
    },
  ];

  return (
    <div className={["form-field", "rich-notes-field", className].filter(Boolean).join(" ")}>
      <label htmlFor={textareaId}>{label}</label>
      <div className="markdown-editor-shell">
        <div className="markdown-toolbar" role="toolbar" aria-label={`${label} formatting`}>
          {toolbarButtons.map((button) => (
            <button
              aria-label={button.label}
              className="markdown-toolbar-button"
              key={button.label}
              title={button.title}
              type="button"
              onClick={button.onClick}
              onMouseDown={(event) => event.preventDefault()}
            >
              {button.icon}
            </button>
          ))}
          <button
            aria-label={showPreview ? "Hide markdown preview" : "Show markdown preview"}
            aria-pressed={showPreview}
            className="markdown-toolbar-button markdown-preview-toggle"
            title={showPreview ? "Hide preview" : "Show preview"}
            type="button"
            onClick={() => setShowPreview((current) => !current)}
          >
            <Eye aria-hidden="true" size={16} />
          </button>
        </div>
        <textarea
          autoFocus={autoFocus}
          className={textareaClassName}
          id={textareaId}
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {showPreview ? (
        <div className="markdown-preview-panel" aria-label={`${label} preview`}>
          <RichNoteText text={value} />
        </div>
      ) : null}
    </div>
  );
}
