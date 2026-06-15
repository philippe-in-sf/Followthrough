export function resolveBlockerClearedAt({
  blockers,
  requestedCleared,
  existingClearedAt = null,
}: {
  blockers: string;
  requestedCleared?: boolean;
  existingClearedAt?: string | null;
}) {
  if (!blockers.trim()) return null;
  if (requestedCleared === true) return existingClearedAt ?? new Date().toISOString();
  if (requestedCleared === false) return null;
  return existingClearedAt;
}
