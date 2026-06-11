export const runtimePaths = ["dist", "package.json", "package-lock.json"] as const;

function timestampPart(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

const GIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

function shortShaPart(gitSha: string) {
  const cleanedSha = gitSha?.trim().toLowerCase() || "";

  if (!GIT_SHA_PATTERN.test(cleanedSha)) {
    throw new Error("Deploy release git sha must be 7 to 40 hexadecimal characters");
  }

  return cleanedSha.slice(0, 7);
}

export function createReleaseId(date: Date, gitSha: string) {
  return `${timestampPart(date)}-${shortShaPart(gitSha)}`;
}
