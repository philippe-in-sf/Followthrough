export function BrandMark({
  logoUrl,
  teamName = "Followthrough",
}: {
  logoUrl?: string | null;
  teamName?: string;
}) {
  if (logoUrl) {
    return <img alt="" className="team-logo" src={logoUrl} title={teamName} />;
  }

  return (
    <svg
      aria-hidden="true"
      className="followthrough-mark"
      focusable="false"
      viewBox="0 0 42 42"
    >
      <path className="mark-letter" d="M13 10h18v5.4H19.2v5.2h10.5V26H19.2v7H13V10Z" />
      <path className="mark-forward" d="M22.5 31.8h9.2" />
    </svg>
  );
}
