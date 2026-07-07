import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
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

  it("collapses urls to text for non-linkable controls", () => {
    expect(
      collapseLinks(
        "Read the deck (https://docs.google.com/presentation/d/example/edit#slide=id.g1).",
      ),
    ).toBe("Read the deck (Link).");
  });
});
