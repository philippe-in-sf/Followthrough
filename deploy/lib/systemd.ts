import type { DeploySite } from "./config";

export function renderSystemdUnit(site: DeploySite) {
  return `[Unit]
Description=Web UI Task Manager
After=network.target

[Service]
Type=simple
WorkingDirectory=${site.appRoot}/current
EnvironmentFile=${site.appRoot}/shared/.env
Environment=NODE_ENV=production
User=${site.serviceUser}
Group=${site.serviceGroup}
ExecStart=/usr/bin/env node dist/server/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
}
