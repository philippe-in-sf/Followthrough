import { sectionNavigation, type AppSection } from "./shellNavigation";

export function MobileSectionSummary({ section }: { section: AppSection }) {
  const current = sectionNavigation[section];

  return (
    <section className="mobile-section-summary" aria-label="Mobile section summary">
      <p className="context-eyebrow">Current section</p>
      <h2>{section}</h2>
      <p className="context-description">{current.description}</p>
      <div className="mobile-context-row-list" aria-label={`${section} mobile shortcuts`}>
        {current.contextRows.map((row) => (
          <div className="mobile-context-row" key={row.label}>
            <span>{row.label}</span>
            {row.value ? <span className="context-row-value">{row.value}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
