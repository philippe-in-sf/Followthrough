import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../server/config";
import type { EmailMessage, EmailSender } from "../../server/email/mailer";
import { renderWelcomeEmail, sendWelcomeEmail } from "../../server/email/welcome";

describe("welcome email", () => {
  it("renders the approved HTML and plain-text welcome message", () => {
    const message = renderWelcomeEmail(
      { ...loadConfig(), appBaseUrl: "https://followthrough.test/" },
      { name: "<Avery> Stone", email: "avery@example.com" },
    );

    expect(message.to).toBe("avery@example.com");
    expect(message.subject).toBe("Followthrough: Welcome to your new account");
    expect(message.text).toContain("Hi <Avery>,");
    expect(message.text).toContain("https://followthrough.test");
    expect(message.text).toContain("Liberty Tower Ste 22E");
    expect(message.html).toContain("Hi &lt;Avery&gt;,");
    expect(message.html).toContain("https://followthrough.test");
    expect(message.html).toContain("/brand/philippe-signature.png");
    expect(message.html).toContain("Liberty Tower Ste 22E");
    expect(message.html).not.toContain("{{");
  });

  it("attempts configured delivery without making user creation depend on SMTP", async () => {
    const sent: EmailMessage[] = [];
    const emailSender: EmailSender = {
      send: vi.fn(async (message) => {
        sent.push(message);
      }),
    };
    const config = { ...loadConfig(), appBaseUrl: "https://followthrough.test" };
    const user = { name: "Avery Stone", email: "avery@example.com" };

    await expect(sendWelcomeEmail({ config, emailSender, user })).resolves.toBe(true);
    expect(sent).toHaveLength(1);

    const failingSender: EmailSender = {
      send: vi.fn(async () => {
        throw new Error("SMTP unavailable");
      }),
    };
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(sendWelcomeEmail({ config, emailSender: failingSender, user })).resolves.toBe(
      false,
    );
    expect(errorLog).toHaveBeenCalledOnce();
    errorLog.mockRestore();
  });
});
