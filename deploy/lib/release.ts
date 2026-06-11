export const runtimePaths = ["dist", "package.json", "package-lock.json"] as const;

function timestampPart(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function shortShaPart(gitSha: string) {
  return gitSha.replace(/[^A-Za-z0-9]/g, "").slice(0, 7);
}

export function createReleaseId(date = new Date(), gitSha = "") {
  const cleanedSha = shortShaPart(gitSha);
  return cleanedSha ? `${timestampPart(date)}-${cleanedSha}` : timestampPart(date);
}
