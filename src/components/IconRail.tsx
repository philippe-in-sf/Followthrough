import { sectionOrder, type AppSection } from "./shellNavigation";

export function IconRail({
  section,
  onSectionChange,
  version,
}: {
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  version: string;
}) {
  return (
    <aside className="icon-rail" aria-label="Task Manager">
      <div className="app-mark" aria-hidden="true">
        TM
      </div>
      <nav className="icon-rail-nav" aria-label="Primary sections">
        {sectionOrder.map(({ section: item, icon: Icon }) => (
          <button
            aria-current={item === section ? "page" : undefined}
            aria-label={item}
            className={item === section ? "icon-rail-button active" : "icon-rail-button"}
            key={item}
            onClick={() => onSectionChange(item)}
            title={item}
            type="button"
          >
            <Icon aria-hidden="true" size={20} strokeWidth={2.1} />
          </button>
        ))}
      </nav>
      <p className="rail-version" aria-label={`Version ${version}`}>
        <span className="rail-version-label">Version </span>
        {version}
      </p>
    </aside>
  );
}
