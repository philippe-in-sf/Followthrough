import fs from "node:fs";
import path from "node:path";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g,
      '<a href="$2">$1</a>',
    );
}

export function readChangelog(cwd = process.cwd()) {
  return fs.readFileSync(path.resolve(cwd, "CHANGELOG.md"), "utf8");
}

export function renderChangelogHtml(markdown: string, version: string) {
  const body: string[] = [];
  let inList = false;

  function closeList() {
    if (!inList) return;
    body.push("</ul>");
    inList = false;
  }

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      body.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = /^-\s+(.+)$/.exec(line);
    if (bullet) {
      if (!inList) {
        body.push("<ul>");
        inList = true;
      }
      body.push(`<li>${renderInline(bullet[1])}</li>`);
      continue;
    }

    closeList();
    body.push(`<p>${renderInline(line)}</p>`);
  }
  closeList();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Followthrough changelog</title>
    <style>
      :root {
        color: #1d2433;
        background: #f6f7f9;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
      }
      main {
        width: min(880px, calc(100% - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 2rem;
      }
      h2 {
        margin: 28px 0 10px;
        border-top: 1px solid #d9dee7;
        padding-top: 20px;
        font-size: 1.35rem;
      }
      h3 {
        margin: 18px 0 8px;
        color: #3b4354;
        font-size: 1rem;
      }
      p, li {
        line-height: 1.55;
      }
      ul {
        margin: 8px 0 14px;
        padding-left: 22px;
      }
      code {
        border-radius: 4px;
        background: #eef2f7;
        padding: 1px 4px;
      }
      a {
        color: #2563eb;
      }
      .meta {
        margin: 0 0 24px;
        color: #5b6475;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="meta">Current deployed package version: ${escapeHtml(version)}</p>
      ${body.join("\n      ")}
    </main>
  </body>
</html>`;
}
