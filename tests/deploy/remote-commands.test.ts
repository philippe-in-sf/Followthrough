import { describe, expect, it } from "vitest";
import type { DeploySite } from "../../deploy/lib/config";
import {
  buildCleanupCommand,
  buildEnsureLayoutCommand,
  buildHealthCheckCommand,
  buildInstallDependenciesCommand,
  buildRestartCommand,
  buildSwitchCurrentCommand,
} from "../../deploy/lib/remoteCommands";
import { quoteShell } from "../../deploy/lib/shell";
import { renderSystemdUnit } from "../../deploy/lib/systemd";

const site: DeploySite = {
  name: "production",
  envPrefix: "DEPLOY_PRODUCTION_",
  ssh: "deploy@example.com",
  appRoot: "/opt/web-ui-task-manager",
  serviceName: "web-ui-task-manager",
  port: 3000,
  keepReleases: 5,
};

describe("shell quoting", () => {
  it("single-quotes values and escapes embedded single quotes", () => {
    expect(quoteShell("/opt/weird app/root")).toBe("'/opt/weird app/root'");
    expect(quoteShell("can't")).toBe("'can'\"'\"'t'");
  });
});

describe("systemd unit rendering", () => {
  it("runs the app from the current release and loads shared env", () => {
    expect(renderSystemdUnit(site)).toContain("WorkingDirectory=/opt/web-ui-task-manager/current");
    expect(renderSystemdUnit(site)).toContain("EnvironmentFile=/opt/web-ui-task-manager/shared/.env");
    expect(renderSystemdUnit(site)).toContain("ExecStart=/usr/bin/env node dist/server/index.js");
    expect(renderSystemdUnit(site)).toContain("Restart=on-failure");
  });
});

describe("remote command rendering", () => {
  it("ensures shared data without overwriting the shared env file", () => {
    const command = buildEnsureLayoutCommand(site);

    expect(command).toContain("mkdir -p");
    expect(command).toContain("/opt/web-ui-task-manager/shared/data");
    expect(command).toContain("if [ ! -f '/opt/web-ui-task-manager/shared/.env' ]; then");
    expect(command).toContain("DATABASE_PATH=/opt/web-ui-task-manager/shared/data/task-manager.sqlite");
    expect(command).not.toContain("rm -rf '/opt/web-ui-task-manager/shared");
  });

  it("installs production dependencies inside a release", () => {
    expect(buildInstallDependenciesCommand(site, "20260611T181920Z")).toContain(
      "cd '/opt/web-ui-task-manager/releases/20260611T181920Z'",
    );
    expect(buildInstallDependenciesCommand(site, "20260611T181920Z")).toContain("npm ci --omit=dev");
  });

  it("switches current with an atomic symlink move", () => {
    const command = buildSwitchCurrentCommand(site, "20260611T181920Z");

    expect(command).toContain("ln -sfn '/opt/web-ui-task-manager/releases/20260611T181920Z' '/opt/web-ui-task-manager/current.next'");
    expect(command).toContain("mv -Tf '/opt/web-ui-task-manager/current.next' '/opt/web-ui-task-manager/current'");
  });

  it("restarts the configured service with sudo", () => {
    expect(buildRestartCommand(site)).toBe("sudo systemctl restart 'web-ui-task-manager'");
  });

  it("checks health on localhost using the configured port", () => {
    expect(buildHealthCheckCommand(site)).toContain("curl --fail --silent --show-error 'http://127.0.0.1:3000/api/health'");
  });

  it("cleans old releases without deleting current or shared data", () => {
    const command = buildCleanupCommand(site);

    expect(command).toContain("readlink '/opt/web-ui-task-manager/current'");
    expect(command).toContain("tail -n +6");
    expect(command).not.toContain("shared");
    expect(command).not.toContain("rm -rf '/opt/web-ui-task-manager'");
  });
});
