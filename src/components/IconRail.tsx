import { CalendarCheck } from "lucide-react";
import { BrandMark } from "./BrandMark";
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
    <aside className="icon-rail" aria-label="Followthrough">
      <div className="app-mark" aria-hidden="true">
        <BrandMark />
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
      <div className="rail-footer">
        <a
          aria-label="Open work calendar"
          className="icon-rail-button rail-calendar-link"
          href="https://calendar.google.com"
          rel="noreferrer"
          target="_blank"
          title="Work calendar"
        >
          <CalendarCheck aria-hidden="true" size={20} strokeWidth={2.1} />
        </a>
        <p className="rail-version" aria-label={`Version ${version}`}>
          <span className="rail-version-label">Version </span>
          {version}
        </p>
      </div>
    </aside>
  );
}
