import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export function readPrivacyPolicyHtml(cwd = process.cwd()) {
  const candidates = [
    path.resolve(cwd, "server/legal/privacy-policy.html"),
    path.resolve(cwd, "dist/server/legal/privacy-policy.html"),
    path.resolve(moduleDir, "legal/privacy-policy.html"),
  ];
  const policyPath = candidates.find((candidate) => fs.existsSync(candidate));

  if (!policyPath) {
    throw new Error("Unable to locate privacy policy HTML asset");
  }

  return fs.readFileSync(policyPath, "utf8");
}

export function renderPrivacyPolicyHtml(policyHtml: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <!-- Google Tag Manager -->
    <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
    new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
    'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
    })(window,document,'script','dataLayer','GTM-MW7M9JGM');</script>
    <!-- End Google Tag Manager -->
    <script id="Cookiebot" src="https://consent.cookiebot.com/uc.js" data-cbid="1b43ed9f-c702-40a9-9db4-ad20277b7a12" data-blockingmode="auto" type="text/javascript"></script>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Followthrough privacy policy</title>
    <style>
      body {
        margin: 0;
        background: #f6f7f9;
      }
      .legal-page {
        width: min(920px, calc(100% - 32px));
        margin: 0 auto;
        padding: 32px 0 56px;
      }
      .legal-back-link {
        display: inline-flex;
        margin: 0 0 24px;
        color: #2563eb;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 0.95rem;
        font-weight: 700;
        text-decoration: none;
      }
      .legal-back-link:hover,
      .legal-back-link:focus-visible {
        text-decoration: underline;
        text-underline-offset: 2px;
      }
    </style>
  </head>
  <body>
    <!-- Google Tag Manager (noscript) -->
    <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-MW7M9JGM"
    height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
    <!-- End Google Tag Manager (noscript) -->
    <main class="legal-page">
      <a class="legal-back-link" href="/">Back to Followthrough</a>
      ${policyHtml}
    </main>
  </body>
</html>`;
}
