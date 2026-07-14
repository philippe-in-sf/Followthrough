import { useEffect, useMemo, useState, type ReactNode } from "react";

export const DEFAULT_PAGE_SIZE = 10;

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function pageForItem<T>({
  focusItemKey,
  getItemKey,
  items,
  pageSize,
}: {
  focusItemKey?: string | null;
  getItemKey?: (item: T) => string;
  items: T[];
  pageSize: number;
}) {
  if (!focusItemKey || !getItemKey) return null;
  const index = items.findIndex((item) => getItemKey(item) === focusItemKey);
  return index >= 0 ? Math.floor(index / pageSize) + 1 : null;
}

export function PaginatedItems<T>({
  children,
  focusItemKey,
  getItemKey,
  itemName,
  items,
  pageSize = DEFAULT_PAGE_SIZE,
  pluralItemName = `${itemName}s`,
  resetKey,
}: {
  children: (items: T[]) => ReactNode;
  focusItemKey?: string | null;
  getItemKey?: (item: T) => string;
  itemName: string;
  items: T[];
  pageSize?: number;
  pluralItemName?: string;
  resetKey?: string | number | null;
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const firstVisibleIndex = (page - 1) * pageSize;
  const visibleItems =
    pageCount > 1 ? items.slice(firstVisibleIndex, firstVisibleIndex + pageSize) : items;

  const focusedPage = useMemo(
    () => pageForItem({ focusItemKey, getItemKey, items, pageSize }),
    [focusItemKey, getItemKey, items, pageSize],
  );

  useEffect(() => {
    if (focusedPage) {
      setPage(focusedPage);
      return;
    }
    setPage(1);
  }, [focusedPage, resetKey]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  return (
    <>
      {children(visibleItems)}
      {pageCount > 1 ? (
        <nav className="pagination-controls" aria-label={`${pluralItemName} pagination`}>
          <span>
            Showing {firstVisibleIndex + 1}-{Math.min(firstVisibleIndex + pageSize, items.length)} of{" "}
            {countLabel(items.length, itemName, pluralItemName)}
          </span>
          <div>
            <button
              className="secondary-button"
              type="button"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <strong>
              Page {page} of {pageCount}
            </strong>
            <button
              className="secondary-button"
              type="button"
              disabled={page === pageCount}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            >
              Next
            </button>
          </div>
        </nav>
      ) : null}
    </>
  );
}
