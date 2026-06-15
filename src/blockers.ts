export type BlockerRecord = {
  blockers: string;
  blockersClearedAt: string | null;
};

export function hasBlockers(record: BlockerRecord) {
  return record.blockers.trim().length > 0;
}

export function hasActiveBlockers(record: BlockerRecord) {
  return hasBlockers(record) && !record.blockersClearedAt;
}

export function hasClearedBlockers(record: BlockerRecord) {
  return hasBlockers(record) && record.blockersClearedAt !== null;
}
