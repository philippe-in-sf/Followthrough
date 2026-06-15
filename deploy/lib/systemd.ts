import type { DeploySite } from "./config";
import { validateDeployAppRoot, validateNonRootLinuxAccountName } from "./validation";

export function renderSystemdUnit(site: DeploySite) {
  const appRoot = validateDeployAppRoot(site.appRoot);
  const serviceUser = validateNonRootLinuxAccountName(site.serviceUser, "serviceUser");
  const serviceGroup = validateNonRootLinuxAccountName(site.serviceGroup, "serviceGroup");

  return `[Unit]
Description=Followthrough
After=network.target

[Service]
Type=simple
WorkingDirectory=${appRoot}/current
EnvironmentFile=${appRoot}/shared/.env
Environment=NODE_ENV=production
User=${serviceUser}
Group=${serviceGroup}
ExecStart=/usr/bin/env node dist/server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
}
