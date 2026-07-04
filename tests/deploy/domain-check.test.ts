import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const domainCheckScript = path.join(repoRoot, "deploy/check-domain.sh");

function writeExecutable(filePath: string, content: string) {
  fs.writeFileSync(filePath, content, { mode: 0o755 });
}

function createDomainCheckFixture() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "domain-check-test-"));
  const binDir = path.join(tempDir, "bin");
  fs.mkdirSync(binDir);

  writeExecutable(
    path.join(binDir, "dig"),
    `#!/bin/sh
if [ "$1" != "+short" ]; then
  exit 1
fi

case "$2 $3" in
  "followthrough.dev A")
    printf '162.0.213.176\\n'
    ;;
  "www.followthrough.dev CNAME")
    printf 'followthrough.dev.\\n'
    ;;
  "www.followthrough.dev A")
    printf 'followthrough.dev.\\n162.0.213.176\\n'
    ;;
  *)
    exit 1
    ;;
esac
`,
  );

  writeExecutable(
    path.join(binDir, "curl"),
    `#!/bin/sh
printf '{"version":"1.2.0"}\\n'
`,
  );

  writeExecutable(
    path.join(binDir, "openssl"),
    `#!/bin/sh
args=" $* "

if [ "$1" = "s_client" ]; then
  printf 'mock certificate chain\\n'
  exit 0
fi

if [ "$1" != "x509" ]; then
  exit 1
fi

case "$args" in
  *" -outform PEM"*)
    cat >/dev/null
    printf 'mock certificate\\n'
    ;;
  *" -checkend "*)
    exit 0
    ;;
  *" -ext subjectAltName"*)
    printf 'X509v3 Subject Alternative Name:\\n    DNS:followthrough.dev, DNS:www.followthrough.dev\\n'
    ;;
  *" -subject "*" -issuer "*" -dates"*)
    printf 'subject=CN=followthrough.dev\\n'
    printf "issuer=C=US, O=Let's Encrypt, CN=YE1\\n"
    printf 'notBefore=Jun 26 11:27:25 2026 GMT\\n'
    printf 'notAfter=Sep 24 11:27:24 2026 GMT\\n'
    ;;
  *" -issuer"*)
    printf "issuer=C=US, O=Let's Encrypt, CN=YE1\\n"
    ;;
  *)
    exit 1
    ;;
esac
`,
  );

  const runDomainCheck = (env: NodeJS.ProcessEnv = {}) =>
    spawnSync("bash", [domainCheckScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
        ...env,
      },
    });

  return {
    runDomainCheck,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

describe("domain check script", () => {
  it("checks DNS, HTTPS, issuer, SANs, and expiry for the production domain", () => {
    const fixture = createDomainCheckFixture();

    try {
      const result = fixture.runDomainCheck();

      expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
      expect(result.stdout).toContain("ok: followthrough.dev resolves to 162.0.213.176");
      expect(result.stdout).toContain("ok: www.followthrough.dev aliases to followthrough.dev.");
      expect(result.stdout).toContain("ok: https://followthrough.dev/api/version responded");
      expect(result.stdout).toContain("ok: followthrough.dev issuer includes Let's Encrypt");
      expect(result.stdout).toContain("ok: www.followthrough.dev is present in certificate SANs");
      expect(result.stdout).toContain("Domain check passed.");
    } finally {
      fixture.cleanup();
    }
  });

  it("fails when the expected issuer override does not match the served certificate", () => {
    const fixture = createDomainCheckFixture();

    try {
      const result = fixture.runDomainCheck({
        DOMAIN_CHECK_EXPECTED_ISSUER: "SSL.com",
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("issuer does not include SSL.com");
      expect(result.stderr).toContain("Domain check failed with 2 issue(s).");
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects a non-numeric expiry window", () => {
    const fixture = createDomainCheckFixture();

    try {
      const result = fixture.runDomainCheck({
        DOMAIN_CHECK_EXPIRY_DAYS: "soon",
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain("DOMAIN_CHECK_EXPIRY_DAYS must be a non-negative integer");
    } finally {
      fixture.cleanup();
    }
  });
});
