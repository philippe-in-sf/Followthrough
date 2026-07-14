import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PaginatedItems } from "../../src/components/PaginatedItems";

const items = Array.from({ length: 7 }, (_, index) => `Item ${index + 1}`);

function renderPaginatedList(focusItemKey?: string) {
  render(
    <PaginatedItems
      items={items}
      itemName="item"
      pageSize={3}
      getItemKey={(item) => item}
      focusItemKey={focusItemKey}
    >
      {(visibleItems) => (
        <ul>
          {visibleItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </PaginatedItems>,
  );
}

describe("PaginatedItems", () => {
  it("pages long lists with next and previous controls", async () => {
    renderPaginatedList();

    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 3")).toBeInTheDocument();
    expect(screen.queryByText("Item 4")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1-3 of 7 items")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.queryByText("Item 1")).not.toBeInTheDocument();
    expect(screen.getByText("Item 4")).toBeInTheDocument();
    expect(screen.getByText("Showing 4-6 of 7 items")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Previous" }));

    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Showing 1-3 of 7 items")).toBeInTheDocument();
  });

  it("opens on the page containing a focused item", async () => {
    renderPaginatedList("Item 6");

    await waitFor(() => expect(screen.getByText("Item 6")).toBeInTheDocument());
    expect(screen.queryByText("Item 1")).not.toBeInTheDocument();
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });
});
