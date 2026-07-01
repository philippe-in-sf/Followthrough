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

  it("keeps Google Calendar panels dark and readable inside skins", () => {
    const css = styles();

    expect(css).toContain(
      ".app-shell[data-skin] .calendar-settings-panel,\n.app-shell[data-skin] .calendar-import-panel,\n.app-shell[data-skin] .calendar-import-preview",
    );
    expect(css).toContain(".app-shell[data-skin] .google-calendar-connection");
    expect(css).toContain("border-bottom-color: var(--skin-border)");
  });

  it("keeps quick add and meeting wizard surfaces dark and readable inside skins", () => {
    const css = styles();

    expect(css).toContain(
      ".app-shell[data-skin] .quick-meeting-form,\n.app-shell[data-skin] .meeting-wizard-panel,\n.app-shell[data-skin] .meeting-wizard-stepper button",
    );
    expect(css).toContain(".app-shell[data-skin] .meeting-wizard-stepper button.active");
    expect(css).toContain(".app-shell[data-skin] .quick-meeting-heading span");
    expect(css).toContain(".app-shell[data-skin] .meeting-wizard-progress");
  });

  it("keeps quick add and meeting wizard layout narrow with rails before mobile collapse", () => {
    const css = styles();
    const desktopRailMedia = css.slice(
      css.indexOf("@media (max-width: 1200px) {"),
      css.indexOf("@media (max-width: 1080px) {"),
    );
    const tabletMedia = css.slice(
      css.indexOf("@media (max-width: 900px) {"),
      css.indexOf("@media (max-width: 700px) {"),
    );

    expect(css).toContain("@media (max-width: 1200px) {");

    expect(desktopRailMedia).toContain("  .quick-meeting-form {\n    grid-template-columns: 1fr 1fr;\n  }");
    expect(desktopRailMedia).toContain(
      "  .quick-meeting-heading,\n  .quick-meeting-form .form-error {\n    grid-column: 1 / -1;\n  }",
    );
    expect(tabletMedia).not.toContain(".quick-meeting-form {");
  });

  it("keeps meeting checkbox option rows dark and readable inside skins", () => {
    const css = styles();

    expect(css).toContain(
      ".app-shell[data-skin] .record-view-toggle,\n.app-shell[data-skin] .record-view-toggle button.active",
    );
    expect(css).toContain(".app-shell[data-skin] .record-view-toggle button");
    expect(css).toContain(
      ".app-shell[data-skin] .checkbox-option-list,\n.app-shell[data-skin] .checkbox-group-empty",
    );
    expect(css).toContain(
      ".app-shell[data-skin] .checkbox-group label,\n.app-shell[data-skin] .checkbox-line",
    );
    expect(css).toContain(".app-shell[data-skin] .checkbox-group label:hover");
    expect(css).toContain("background: var(--skin-surface-alt)");
  });

  it("keeps admin configuration panels dark and readable inside skins", () => {
    const css = styles();

    expect(css).toContain(".app-shell[data-skin] .admin-panel");
    expect(css).toContain(".app-shell[data-skin] .admin-add-user-form");
    expect(css).toContain(".app-shell[data-skin] .admin-user-table th");
    expect(css).toContain(".app-shell[data-skin] .admin-user-table td");
    expect(css).toContain("border-bottom-color: var(--skin-border)");
  });

  it("keeps marketing eyebrow labels readable on light homepage sections", () => {
    const css = styles();

    expect(css).toContain(".marketing-eyebrow {\n  margin: 0 0 12px;\n  color: #0f766e;");
    expect(css).toContain(".marketing-hero .marketing-eyebrow {\n  color: #facc15;");
  });
});
