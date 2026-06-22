import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type SearchResult } from "../api/client";
import { collapseLinks } from "./LinkedText";
import type { AppSection } from "./AppShell";

const sectionByType: Record<SearchResult["type"], AppSection> = {
  task: "Tasks",
  meeting: "Meetings",
  decision: "Decisions",
  person: "People",
};

export function GlobalSearch({ onOpenSection }: { onOpenSection: (section: AppSection) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    let cancelled = false;
    const value = query.trim();
    if (!value) {
      setResults([]);
      return;
    }

    void api
      .search(value)
      .then((response) => {
        if (!cancelled) setResults(response.results ?? []);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  function openResult(result: SearchResult) {
    onOpenSection(sectionByType[result.type]);
    setQuery("");
    setResults([]);
  }

  return (
    <div className="global-search-wrap">
      <label className="global-search">
        <Search size={18} aria-hidden />
        <span className="sr-only">Search</span>
        <input
          value={query}
          placeholder="Search by ID, task, meeting, decision, or person"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {results.length > 0 ? (
        <div className="search-results" role="listbox" aria-label="Search results">
          {results.map((result) => (
            <button
              key={`${result.type}-${result.publicId}`}
              type="button"
              aria-label={`${result.publicId} ${collapseLinks(result.title)} ${collapseLinks(result.subtitle)}`}
              onClick={() => openResult(result)}
            >
              <strong>{result.publicId}</strong>
              <span>{collapseLinks(result.title)}</span>
              <small>{collapseLinks(result.subtitle)}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
