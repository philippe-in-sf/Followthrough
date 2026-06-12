import { sectionNavigation, type AppSection } from "./shellNavigation";

export function ContextRail({ section }: { section: AppSection }) {
  const current = sectionNavigation[section];

  return (
    <aside className="context-rail" aria-label={`${section} context`}>
      <p className="context-eyebrow">Current section</p>
      <h2>{section}</h2>
      <p className="context-description">{current.description}</p>
      <div className="context-row-list" aria-label={`${section} shortcuts`}>
        {current.contextRows.map((row) => (
          <div className="context-row" key={row.label}>
            <span>{row.label}</span>
            {row.value ? <span className="context-row-value">{row.value}</span> : null}
          </div>
        ))}
      </div>
    </aside>
  );
}
