import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "../config.js";
import type { EmailSender } from "./mailer.js";

type WelcomeUser = {
  name: string;
  email: string;
};

type SendWelcomeEmailInput = {
  config: AppConfig;
  emailSender: EmailSender | null | undefined;
  user: WelcomeUser;
  requestOrigin?: string;
};

const templatePaths = [
  path.resolve(process.cwd(), "docs/email-templates/welcome.html"),
  path.resolve(process.cwd(), "../docs/email-templates/welcome.html"),
  path.resolve(process.cwd(), "../../docs/email-templates/welcome.html"),
];

let cachedTemplate: string | null = null;

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function getTemplate() {
  const templatePath = templatePaths.find((candidate) => fs.existsSync(candidate));
  if (!templatePath) throw new Error("Welcome email template is missing");
  cachedTemplate ??= fs.readFileSync(templatePath, "utf8");
  return cachedTemplate;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name.trim();
}

function loginUrl(config: AppConfig, requestOrigin?: string) {
  return (config.appBaseUrl || requestOrigin || "https://followthrough.dev").replace(/\/+$/, "");
}

export function renderWelcomeEmail(
  config: AppConfig,
  user: WelcomeUser,
  requestOrigin?: string,
) {
  const recipientFirstName = firstName(user.name);
  const accessUrl = loginUrl(config, requestOrigin);
  const html = getTemplate()
    .replaceAll("{{firstName}}", htmlEscape(recipientFirstName))
    .replaceAll("{{emailAddress}}", htmlEscape(user.email))
    .replaceAll("{{loginUrl}}", htmlEscape(accessUrl));

  const text = [
    `Hi ${recipientFirstName},`,
    "",
    "Welcome to Followthrough, the task and meeting management system that you didn’t know you wanted.",
    "",
    "Your account has been created, and you can sign in below.",
    "",
    accessUrl,
    "",
    `Your username is your email address: ${user.email}`,
    "",
    "Followthrough helps you keep track of meetings, decisions, tasks, and follow-ups in one place.",
    "",
    "If you weren’t expecting this email or need help accessing your account, contact philippe@followthrough.dev.",
    "",
    "Welcome aboard,",
    "Philippe Beaudette",
    "",
    "P.S. When you log in, you may notice that there are already meetings, notes, and tasks. Followthrough is different, and those are all shared with your team unless you check the Private button!",
    "",
    `You’re receiving this transactional email because a Followthrough account was created for ${user.email}.`,
    "",
    "Followthrough · Philippe Beaudette",
    "Liberty Tower Ste 22E",
    "1502 S Boulder Avenue",
    "Tulsa, OK 74119",
    "Questions? Contact philippe@followthrough.dev.",
  ].join("\n");

  return {
    to: user.email,
    subject: "Followthrough: Welcome to your new account",
    text,
    html,
  };
}

export async function sendWelcomeEmail({
  config,
  emailSender,
  user,
  requestOrigin,
}: SendWelcomeEmailInput) {
  if (!emailSender) return false;

  try {
    await emailSender.send(renderWelcomeEmail(config, user, requestOrigin));
    return true;
  } catch (error) {
    console.error(`Unable to send welcome email to ${user.email}`, error);
    return false;
  }
}
