export function StatusBadge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return <span className={`status-badge status-${tone}`}>{label}</span>;
}
