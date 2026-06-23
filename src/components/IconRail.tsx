import { CalendarCheck, ScrollText } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { sectionOrder, type AppSection } from "./shellNavigation";

export function IconRail({
  section,
  onSectionChange,
  version,
  workCalendarUrl,
}: {
  section: AppSection;
  onSectionChange: (section: AppSection) => void;
  version: string;
  workCalendarUrl?: string | null;
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
        {workCalendarUrl ? (
          <a
            aria-label="Open calendar shortcut"
            className="icon-rail-button rail-calendar-link"
            href={workCalendarUrl}
            rel="noreferrer"
            target="_blank"
            title="Calendar shortcut"
          >
            <CalendarCheck aria-hidden="true" size={20} strokeWidth={2.1} />
          </a>
        ) : null}
        <a
          aria-label="Open changelog"
          className="icon-rail-button rail-calendar-link"
          href="/changelog"
          title="Changelog"
        >
          <ScrollText aria-hidden="true" size={20} strokeWidth={2.1} />
        </a>
        <p className="rail-version" aria-label={`Version ${version}`}>
          <span className="rail-version-label">Version </span>
          {version}
        </p>
      </div>
    </aside>
  );
}
