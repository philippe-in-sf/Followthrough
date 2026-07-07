import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import {
  MarkdownNotesEditor,
  RichNoteText,
} from "../../src/components/RichNotes";

function MarkdownEditorHarness() {
  const [value, setValue] = useState("");
  return <MarkdownNotesEditor label="Task notes" value={value} onChange={setValue} />;
}

describe("RichNotes", () => {
  it("renders markdown notes without losing inline app links", async () => {
    const onRecordOpen = vi.fn();
    render(
      <RichNoteText
        text={[
          "## Launch notes",
          "",
          "- **Owner:** P010",
          "- See [Deck](https://example.com/deck)",
          "",
          "> Use `pilot` scope first.",
        ].join("\n")}
        onRecordOpen={onRecordOpen}
      />,
    );

    expect(screen.getByRole("heading", { name: "Launch notes" })).toBeInTheDocument();
    expect(screen.getByText("Owner:")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Deck" })).toHaveAttribute(
      "href",
      "https://example.com/deck",
    );
    expect(screen.getByText("pilot")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open person P010" }));
    expect(onRecordOpen).toHaveBeenCalledWith({ publicId: "P010", type: "person" });
  });

  it("inserts markdown syntax from the notes toolbar", async () => {
    render(<MarkdownEditorHarness />);

    const notes = screen.getByLabelText("Task notes");
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(notes).toHaveValue("**important**");

    await userEvent.click(screen.getByRole("button", { name: "Show markdown preview" }));
    expect(screen.getByLabelText("Task notes preview")).toHaveTextContent("important");
  });
});
