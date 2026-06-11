import type { DeploySite } from "./config";
import { buildEnsureLayoutCommand } from "./remoteCommands";
import { quoteShell } from "./shell";
import { renderSystemdUnit } from "./systemd";
import { systemdUnitName } from "./validation";

export function buildInstallSystemdCommand(site: DeploySite) {
  const unitName = systemdUnitName(site.serviceName);
  const unitPath = `/etc/systemd/system/${unitName}`;
  const unit = renderSystemdUnit(site);

  return [
    "set -euo pipefail",
    'tmp_unit="$(mktemp)"',
    'trap \'rm -f "$tmp_unit"\' EXIT',
    buildEnsureLayoutCommand(site),
    'cat > "$tmp_unit" <<\'UNIT\'',
    unit.trimEnd(),
    "UNIT",
    `sudo install -o root -g root -m 0644 "$tmp_unit" ${quoteShell(unitPath)}`,
    "sudo systemctl daemon-reload",
    `sudo systemctl enable -- ${quoteShell(unitName)}`,
  ].join("\n");
}
