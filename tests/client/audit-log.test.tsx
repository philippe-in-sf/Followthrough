import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { AuditLog, formatAuditTime } from "../../src/components/AuditLog";

describe("AuditLog", () => {
  it("formats database audit timestamps as local time with a timezone label", () => {
    expect(
      formatAuditTime("2026-06-09 12:00:00", {
        locale: "en-US",
        timeZone: "America/Chicago",
      }),
    ).toBe("Jun 9, 2026, 7:00 AM CDT");
  });

  it("shows the timezone in audit history metadata", () => {
    render(
      <AuditLog
        events={[
          {
            id: 1,
            entityType: "task",
            entityPublicId: "T001",
            action: "created",
            summary: "Created task",
            actorName: "Editor",
            createdAt: "2026-06-09 12:00:00",
            changes: {},
          },
        ]}
      />,
    );

    expect(screen.getByText(/Editor - .* (?:UTC|GMT[+-]\d{1,2}|[A-Z]{3,5})$/)).toBeInTheDocument();
  });
});
