type BrandMarkVariant = "icon" | "logo" | "logoWhite" | "wordmark";

const followthroughMarks: Record<BrandMarkVariant, string> = {
  icon: "/brand/followthrough-icon.svg",
  logo: "/brand/followthrough-logo.svg",
  logoWhite: "/brand/followthrough-logo-white.svg",
  wordmark: "/brand/followthrough-wordmark.svg",
};

const variantClasses: Record<BrandMarkVariant, string> = {
  icon: "followthrough-mark-icon",
  logo: "followthrough-mark-logo",
  logoWhite: "followthrough-mark-logo-white",
  wordmark: "followthrough-mark-wordmark",
};

export function BrandMark({
  className,
  logoUrl,
  teamName = "Followthrough",
  variant = "icon",
}: {
  className?: string;
  logoUrl?: string | null;
  teamName?: string;
  variant?: BrandMarkVariant;
}) {
  if (logoUrl) {
    return (
      <img
        alt=""
        className={["team-logo", className].filter(Boolean).join(" ")}
        src={logoUrl}
        title={teamName}
      />
    );
  }

  return (
    <img
      alt=""
      className={["followthrough-mark", variantClasses[variant], className]
        .filter(Boolean)
        .join(" ")}
      src={followthroughMarks[variant]}
    />
  );
}
