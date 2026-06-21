import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function styles() {
  return readFileSync(join(process.cwd(), "src/styles.css"), "utf8");
}

describe("skin contrast styles", () => {
  it("keeps collapsed cards dark and readable inside dark skins", () => {
    const css = styles();

    expect(css).toContain(
      ".app-shell[data-skin] .meeting-summary-button,\n.app-shell[data-skin] .task-summary-button,\n.app-shell[data-skin] .meeting-expanded-content,\n.app-shell[data-skin] .task-expanded-content",
    );
    expect(css).toContain("background: var(--skin-surface)");
    expect(css).toContain("color: var(--skin-text)");
    expect(css).toContain(
      ".app-shell[data-skin] .meeting-summary-title > span:last-child,\n.app-shell[data-skin] .meeting-summary-date,\n.app-shell[data-skin] .meeting-summary-counts,\n.app-shell[data-skin] .task-summary-title > span:last-child,\n.app-shell[data-skin] .task-summary-meta > span:not(.status-badge)",
    );
  });
});
