import { describe, expect, it } from "vitest";
import type { DeploySite } from "../../deploy/lib/config";
import { buildInstallSystemdCommand } from "../../deploy/lib/systemdInstall";

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

describe("systemd installer command rendering", () => {
  it("installs the generated unit through a private temporary file", () => {
    const command = buildInstallSystemdCommand(site);

    expect(command).toContain('tmp_unit="$(mktemp)"');
    expect(command).toContain('trap \'rm -f "$tmp_unit"\' EXIT');
    expect(command).toContain("cat > \"$tmp_unit\" <<'UNIT'");
    expect(command).toContain(
      'sudo install -o root -g root -m 0644 "$tmp_unit" \'/etc/systemd/system/web-ui-task-manager.service\'',
    );
    expect(command).toContain("sudo systemctl daemon-reload");
    expect(command).toContain("sudo systemctl enable -- 'web-ui-task-manager.service'");
    expect(command).not.toContain("/tmp/web-ui-task-manager.service");
  });
});
