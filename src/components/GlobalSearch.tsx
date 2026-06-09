import { Search } from "lucide-react";

export function GlobalSearch({ onSearch }: { onSearch: (query: string) => void }) {
  return (
    <label className="global-search">
      <Search size={18} aria-hidden />
      <span className="sr-only">Search</span>
      <input
        placeholder="Search by ID, task, meeting, decision, or person"
        onChange={(event) => onSearch(event.target.value)}
      />
    </label>
  );
}
