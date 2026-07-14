function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderPrivacyPolicyHtml(version: string) {
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
      :root {
        color: #1d2433;
        background: #f6f7f9;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
      }
      main {
        width: min(900px, calc(100% - 32px));
        margin: 0 auto;
        padding: 32px 0 52px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 2rem;
      }
      h2 {
        margin: 30px 0 10px;
        border-top: 1px solid #d9dee7;
        padding-top: 20px;
        font-size: 1.35rem;
      }
      h3 {
        margin: 18px 0 8px;
        color: #3b4354;
        font-size: 1rem;
      }
      p, li {
        line-height: 1.58;
      }
      ul {
        margin: 8px 0 14px;
        padding-left: 22px;
      }
      a {
        color: #2563eb;
      }
      .meta {
        margin: 0 0 24px;
        color: #5b6475;
      }
      .notice {
        border: 1px solid #cfd7e6;
        border-radius: 8px;
        background: #ffffff;
        padding: 18px 20px;
      }
    </style>
  </head>
  <body>
    <!-- Google Tag Manager (noscript) -->
    <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-MW7M9JGM"
    height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
    <!-- End Google Tag Manager (noscript) -->
    <main>
      <p class="meta">Effective July 14, 2026. Current deployed package version: ${escapeHtml(version)}</p>
      <h1>Followthrough Privacy Policy</h1>
      <p>
        This Privacy Policy explains how Followthrough collects, uses, discloses, retains, and protects personal
        information when people visit followthrough.dev, join the waitlist, create an account, connect calendar services,
        receive notifications, or use the Followthrough workspace application.
      </p>

      <section class="notice" aria-label="Notice at collection">
        <h2>Notice at collection</h2>
        <p>
          We collect account, workspace, calendar, notification, waitlist, login, device, cookie, and support information
          to provide and secure Followthrough, operate teams and roles, send requested alerts and reset emails, import
          selected calendar details, maintain backups, prevent abuse, understand product usage, and comply with legal
          obligations. We do not sell personal information or share it for cross-context behavioral advertising.
        </p>
      </section>

      <h2>Personal information we collect</h2>
      <ul>
        <li><strong>Account information:</strong> name, email address, password hash, role, team membership, preferences, and password reset token records.</li>
        <li><strong>Workspace content:</strong> tasks, meetings, meeting notes, decisions, people records, attendee and assignee information, due dates, blockers, links, reminders, and related activity entered or imported by users.</li>
        <li><strong>Calendar connection information:</strong> Google Calendar connection status, connected Google email address, OAuth access and refresh tokens, and event information returned during user-initiated calendar searches or imports, such as title, time, location, attendees, descriptions, notes, and meeting links.</li>
        <li><strong>Notification and communication information:</strong> email delivery details for reset messages and task reminders, plus web push subscription endpoints and keys when browser notifications are enabled.</li>
        <li><strong>Waitlist information:</strong> name, email address, invite handling status, and invite code records for people requesting access.</li>
        <li><strong>Login, security, and device information:</strong> sign-in date and time, user ID, team, IP address, user agent, session cookies, technical logs, and similar records used for security and operations.</li>
        <li><strong>Cookie and analytics information:</strong> cookie consent choices and limited usage information collected through Cookiebot and Google Tag Manager where permitted by consent settings and applicable law.</li>
      </ul>

      <h2>How we use personal information</h2>
      <ul>
        <li>Provide, maintain, personalize, and improve Followthrough workspaces, including tasks, meetings, notes, decisions, people records, search, reminders, backups, and admin features.</li>
        <li>Authenticate users, manage sessions, process password resets, manage team membership, enforce role-based access, and protect against unauthorized access or abuse.</li>
        <li>Send service communications, reminder emails, password reset emails, waitlist follow-up, and browser notifications requested or enabled by users.</li>
        <li>Connect to Google Calendar when a user chooses to do so, search the user's calendar, and import only the event details the user applies to a meeting.</li>
        <li>Maintain operational records, diagnose issues, audit deployments and backups, comply with legal obligations, and enforce applicable terms or policies.</li>
      </ul>

      <h2>How we disclose personal information</h2>
      <ul>
        <li><strong>Within a workspace:</strong> workspace content and user profile details may be visible to other members of the same team according to their role and the product's permission model.</li>
        <li><strong>To administrators:</strong> team administrators can manage users in their teams and view team login activity. Owner-level operators may access data across teams when necessary to operate, secure, support, or administer the service.</li>
        <li><strong>To service providers:</strong> we use providers for hosting, databases, email delivery, analytics, cookie consent management, and related infrastructure. They may process personal information only as needed to provide services to Followthrough.</li>
        <li><strong>To connected services:</strong> when a user connects Google Calendar, Google receives the information necessary to authenticate the connection and provide calendar API responses under the user's Google settings.</li>
        <li><strong>For legal, security, or business reasons:</strong> we may disclose information when required by law, to protect rights and safety, investigate abuse, enforce policies, or as part of a merger, acquisition, financing, or transfer of the service.</li>
      </ul>

      <h2>Retention</h2>
      <p>
        We keep personal information for as long as needed to provide Followthrough, maintain accurate workspace records,
        satisfy security, backup, audit, legal, and accounting needs, and resolve disputes. Backup copies may persist for
        the configured backup retention period before deletion. Password reset tokens expire automatically. When a team or
        account is deleted, some information may remain in backups or audit records until those records expire or are no
        longer needed.
      </p>

      <h2>Security</h2>
      <p>
        Followthrough uses access controls, role-based permissions, hashed passwords, session protections, database
        backups, and operational safeguards designed to protect personal information. No internet service can guarantee
        perfect security, so users should keep passwords confidential and notify us promptly about suspected unauthorized
        access.
      </p>

      <h2>Your choices and privacy rights</h2>
      <ul>
        <li>You can update account settings, change your password, disconnect Google Calendar, and control browser notification permission from the product or your browser settings.</li>
        <li>You can request access, correction, deletion, export, or restriction of personal information by contacting us at <a href="mailto:philippe@beaudette.me">philippe@beaudette.me</a>. We may need to verify your identity and authority before completing a request.</li>
        <li>California residents may have rights to know, access, correct, delete, and obtain a copy of personal information, and to opt out of sale or sharing for cross-context behavioral advertising. Followthrough does not sell personal information or share it for cross-context behavioral advertising.</li>
        <li>We will not discriminate against users for exercising applicable privacy rights.</li>
      </ul>

      <h2>Children</h2>
      <p>
        Followthrough is intended for workplace and professional use. It is not directed to children under 13, and we do
        not knowingly collect personal information from children under 13.
      </p>

      <h2>International use</h2>
      <p>
        Followthrough is operated from the United States. If you use the service from outside the United States, your
        information may be processed in the United States and other locations where our service providers operate.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. When we make material changes, we will update the effective
        date and provide notice in the product or by another reasonable method.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or privacy requests can be sent to <a href="mailto:philippe@beaudette.me">philippe@beaudette.me</a>.
      </p>
    </main>
  </body>
</html>`;
}
