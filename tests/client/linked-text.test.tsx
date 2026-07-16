import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { collapseLinks, LinkedText } from "../../src/components/LinkedText";

describe("LinkedText", () => {
  it("collapses bare urls to compact links", () => {
    const { container } = render(
      <p>
        <LinkedText text="Read the deck (https://docs.google.com/presentation/d/example/edit#slide=id.g1)." />
      </p>,
    );

    expect(container).toHaveTextContent("Read the deck (Link).");
    const link = screen.getByRole("link", { name: "Link" });
    expect(link).toHaveAttribute(
      "href",
      "https://docs.google.com/presentation/d/example/edit#slide=id.g1",
    );
  });

  it("leaves descriptions without urls unchanged", () => {
    render(
      <p>
        <LinkedText text="Send the notes" />
      </p>,
    );

    expect(screen.getByText("Send the notes")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links public record IDs when a record opener is provided", async () => {
    const onRecordOpen = vi.fn();
    render(
      <p>
        <LinkedText text="Follow up with P010 about T009 after M254." onRecordOpen={onRecordOpen} />
      </p>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Open person P010" }));
    await userEvent.click(screen.getByRole("button", { name: "Open task T009" }));
    await userEvent.click(screen.getByRole("button", { name: "Open meeting M254" }));

    expect(onRecordOpen).toHaveBeenNthCalledWith(1, { publicId: "P010", type: "person" });
    expect(onRecordOpen).toHaveBeenNthCalledWith(2, { publicId: "T009", type: "task" });
    expect(onRecordOpen).toHaveBeenNthCalledWith(3, { publicId: "M254", type: "meeting" });
  });

  it("leaves public record IDs as text without a record opener", () => {
    render(
      <p>
        <LinkedText text="Follow up with P010 about T009." />
      </p>,
    );

    expect(screen.getByText("Follow up with P010 about T009.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open/ })).not.toBeInTheDocument();
  });

  it("collapses urls to text for non-linkable controls", () => {
    expect(
      collapseLinks(
        "Read the deck (https://docs.google.com/presentation/d/example/edit#slide=id.g1).",
      ),
    ).toBe("Read the deck (Link).");
  });

  it("collapses the T031 title link without leaking slide fragments", () => {
    expect(
      collapseLinks(
        "Do Managers+ deck (https://docs.google.com/presentation/d/1OG6c5X9jCxhsqT8WSy31Wj9-JDWPjdG6IH5ywC0L7dg/edit?slide=id.g3e977fce53a_0_0#slide=id.g3e977fce53a_0_0)",
      ),
    ).toBe("Do Managers+ deck (Link)");
  });

  it("collapses markdown links to text for non-linkable controls", () => {
    expect(
      collapseLinks(
        "Read the deck ([Link](https://docs.google.com/presentation/d/example/edit?slide=id.g1)00#slide=id.g100).",
      ),
    ).toBe("Read the deck (Link).");
  });
});
