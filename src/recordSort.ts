export type PublicRecord = {
  publicId: string;
};

export function comparePublicRecordNumber(left: PublicRecord, right: PublicRecord) {
  return left.publicId.localeCompare(right.publicId, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
