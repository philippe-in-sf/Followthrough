import fs from "node:fs";
import path from "node:path";

export function findChangelogEntry(markdown: string, version: string) {
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingPattern = new RegExp(
    `^##\\s+(?:\\[)?${escapedVersion}(?:\\])?(?:\\s|$)`,
    "m",
  );
  const headingMatch = headingPattern.exec(markdown);
  if (!headingMatch) return null;

  const start = headingMatch.index;
  const nextHeading = markdown.slice(start + headingMatch[0].length).search(/^##\s+/m);
  const end =
    nextHeading === -1 ? markdown.length : start + headingMatch[0].length + nextHeading;
  return markdown.slice(start, end).trim();
}

export function assertChangelogHasVersion(version: string, cwd = process.cwd()) {
  const changelogPath = path.resolve(cwd, "CHANGELOG.md");
  const markdown = fs.readFileSync(changelogPath, "utf8");
  const entry = findChangelogEntry(markdown, version);

  if (!entry) {
    throw new Error(`CHANGELOG.md is missing a release entry for version ${version}`);
  }

  const entryBody = entry.split(/\r?\n/).slice(1).join("\n").trim();
  if (!/^-\s+\S/m.test(entryBody)) {
    throw new Error(`CHANGELOG.md entry for version ${version} must include at least one bullet`);
  }

  return entry;
}
