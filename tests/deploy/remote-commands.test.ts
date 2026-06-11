import { describe, expect, it } from "vitest";
import type { DeploySite } from "../../deploy/lib/config";
import {
  buildCleanupCommand,
  buildEnsureLayoutCommand,
  buildHealthCheckCommand,
  buildInstallDependenciesCommand,
  buildRestartCommand,
  buildRsyncReleaseTarget,
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
  serviceUser: "taskmanager",
  serviceGroup: "taskmanager",
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
    const unit = renderSystemdUnit(site);

    expect(unit).toContain("WorkingDirectory=/opt/web-ui-task-manager/current");
    expect(unit).toContain("EnvironmentFile=/opt/web-ui-task-manager/shared/.env");
    expect(unit).toContain("User=taskmanager");
    expect(unit).toContain("Group=taskmanager");
    expect(unit).toContain("ExecStart=/usr/bin/env node dist/server/index.js");
    expect(unit).toContain("Restart=on-failure");
    expect(unit).toContain("WantedBy=multi-user.target");
  });

  it("rejects dangerous app roots before rendering units", () => {
    for (const appRoot of ["relative/path", "/", "/opt", "/srv", "/opt/../tmp/app"]) {
      expect(() => renderSystemdUnit({ ...site, appRoot })).toThrow(/appRoot/);
    }
  });

  it("rejects unsafe service identities before rendering units", () => {
    expect(() => renderSystemdUnit({ ...site, serviceUser: "9taskmanager" })).toThrow(/serviceUser/);
    expect(() => renderSystemdUnit({ ...site, serviceGroup: "root" })).toThrow(/serviceGroup/);
  });
});

describe("remote command rendering", () => {
  it("ensures shared data without overwriting the shared env file", () => {
    const command = buildEnsureLayoutCommand(site);

    expect(command).toContain("mkdir -p");
    expect(command).toContain("sudo mkdir -p '/opt/web-ui-task-manager' '/opt/web-ui-task-manager/releases' '/opt/web-ui-task-manager/shared' '/opt/web-ui-task-manager/shared/data'");
    expect(command).toContain("/opt/web-ui-task-manager/shared/data");
    expect(command).toContain("deploy_user=\"$(id -un)\"");
    expect(command).toContain("deploy_group=\"$(id -gn)\"");
    expect(command).toContain("sudo chown -R \"${deploy_user}:${deploy_group}\" '/opt/web-ui-task-manager/releases'");
    expect(command).toContain("sudo chown \"${deploy_user}:${deploy_group}\" '/opt/web-ui-task-manager/shared'");
    expect(command).toContain("sudo chown -R 'taskmanager':'taskmanager' '/opt/web-ui-task-manager/shared/data'");
    expect(command).not.toContain("$USER:$USER");
    expect(command).not.toContain("\"$USER\":\"$USER\"");
    expect(command).toContain("if [ ! -f '/opt/web-ui-task-manager/shared/.env' ]; then");
    expect(command).toContain("DATABASE_PATH=/opt/web-ui-task-manager/shared/data/task-manager.sqlite");
    expect(command).not.toContain("rm -rf '/opt/web-ui-task-manager/shared");
  });

  it("rejects dangerous app roots before rendering commands", () => {
    for (const appRoot of ["relative/path", "/", "/opt", "/srv", "/opt/.", "/srv/.", "/opt/../tmp/app"]) {
      expect(() => buildEnsureLayoutCommand({ ...site, appRoot })).toThrow(/appRoot/);
    }
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
    expect(buildRestartCommand(site)).toBe("sudo systemctl restart -- 'web-ui-task-manager.service'");
  });

  it("formats rsync release targets using a validated app root", () => {
    expect(buildRsyncReleaseTarget(site, "20260611T181920Z-abcdef1")).toBe(
      "deploy@example.com:/opt/web-ui-task-manager/releases/20260611T181920Z-abcdef1/",
    );
  });

  it("rejects app roots that are unsafe for rsync remote targets", () => {
    for (const appRoot of [
      "relative/path",
      "/opt/web ui task-manager",
      "/opt/web-ui-task-manager;rm",
      "/opt/web-ui-task-manager/$HOME",
      "/opt/web-ui-task-manager/../other",
    ]) {
      expect(() => buildRsyncReleaseTarget({ ...site, appRoot }, "20260611T181920Z")).toThrow(
        /appRoot/,
      );
    }
  });

  it("retries health checks on localhost using the configured port", () => {
    const command = buildHealthCheckCommand(site);

    expect(command).toContain("for attempt in 1 2 3 4 5 6 7 8 9 10; do");
    expect(command).toContain("curl --fail --silent --show-error 'http://127.0.0.1:3000/api/health'");
    expect(command).toContain("if [ \"$attempt\" -lt 10 ]; then");
    expect(command).toContain("sleep 1");
    expect(command).toMatch(/done\nexit 1$/);
  });

  it("cleans old releases without deleting current or shared data", () => {
    const command = buildCleanupCommand(site);

    expect(command).toContain("canonicalize_path() {");
    expect(command).toContain("readlink -f \"$1\" 2>/dev/null || realpath \"$1\"");
    expect(command).toContain("current_target=\"$(canonicalize_path '/opt/web-ui-task-manager/current' || true)\"");
    expect(command).toContain("release_path=\"$PWD/$release\"");
    expect(command).toContain("release_target=\"$(canonicalize_path \"$release_path\")\"");
    expect(command).toContain("tail -n +6");
    expect(command).not.toContain("shared");
    expect(command).not.toContain("rm -rf '/opt/web-ui-task-manager'");
  });

  it("does not delete canonicalized release targets when cleaning symlink entries", () => {
    const command = buildCleanupCommand(site);

    expect(command).toContain("if [ \"$release_target\" = \"$current_target\" ]; then");
    expect(command).toContain("continue");
    expect(command).toContain("if [ -L \"$release_path\" ]; then");
    expect(command).toContain("rm -f -- \"$release_path\"");
    expect(command).toContain("rm -rf -- \"$release_path\"");
    expect(command).not.toContain("rm -rf -- \"$release_target\"");
  });
});
