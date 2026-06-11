import path from "node:path";

const PROTECTED_APP_ROOTS = new Set(["/", "/opt", "/srv"]);
const SAFE_APP_ROOT_PATTERN = /^\/[A-Za-z0-9._/-]+$/;
const SYSTEMD_SERVICE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const LINUX_ACCOUNT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*\$?$/;

export function validateDeployAppRoot(appRoot: string) {
  if (!appRoot.startsWith("/")) {
    throw new Error(`Invalid deploy appRoot: must be an absolute path, got ${appRoot}`);
  }

  if (!SAFE_APP_ROOT_PATTERN.test(appRoot)) {
    throw new Error(
      `Invalid deploy appRoot: only letters, numbers, dot, underscore, slash, and hyphen are allowed, got ${appRoot}`,
    );
  }

  const normalizedRoot = path.posix.normalize(appRoot).replace(/\/+$/, "") || "/";
  const comparableRoot = normalizedRoot;
  if (PROTECTED_APP_ROOTS.has(comparableRoot)) {
    throw new Error(`Invalid deploy appRoot: refusing to deploy directly into ${appRoot}`);
  }

  if (appRoot.split("/").includes("..")) {
    throw new Error(`Invalid deploy appRoot: path segments cannot include "..", got ${appRoot}`);
  }

  return normalizedRoot;
}

export function validateSystemdServiceName(serviceName: string, label = "serviceName") {
  if (!SYSTEMD_SERVICE_NAME_PATTERN.test(serviceName)) {
    throw new Error(
      `Invalid ${label}: must start with a letter or number and contain only letters, numbers, underscores, and hyphens; omit any .service suffix, got ${serviceName}`,
    );
  }

  return serviceName;
}

export function systemdUnitName(serviceName: string) {
  return `${validateSystemdServiceName(serviceName)}.service`;
}

export function validateLinuxAccountName(value: string, label: string) {
  if (!LINUX_ACCOUNT_NAME_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}: must be a simple Linux account or group name, got ${value}`);
  }

  return value;
}

export function validateNonRootLinuxAccountName(value: string, label: string) {
  const accountName = validateLinuxAccountName(value, label);

  if (accountName === "root") {
    throw new Error(`Invalid ${label}: cannot be root`);
  }

  return accountName;
}
