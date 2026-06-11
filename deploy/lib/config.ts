export type DeploySite = {
  name: string;
  envPrefix: string;
  ssh: string;
  appRoot: string;
  serviceName: string;
  serviceUser: string;
  serviceGroup: string;
  port: number;
  keepReleases: number;
};

export type DeployConfig = {
  sites: DeploySite[];
};

type EnvMap = Record<string, string | undefined>;

const DEFAULT_APP_ROOT = "/opt/web-ui-task-manager";
const DEFAULT_SERVICE_NAME = "web-ui-task-manager";
const DEFAULT_SERVICE_USER = "web-ui-task-manager";
const DEFAULT_PORT = 3000;
const DEFAULT_KEEP_RELEASES = 5;
const SITE_NAME_PATTERN = /^[A-Za-z0-9_]+$/;
const LINUX_ACCOUNT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*\$?$/;
const POSITIVE_DECIMAL_INTEGER_PATTERN = /^[1-9]\d*$/;

function envPrefixForSite(siteName: string) {
  if (!SITE_NAME_PATTERN.test(siteName)) {
    throw new Error(`Deploy site names may only contain letters, numbers, and underscores: ${siteName}`);
  }

  return `DEPLOY_${siteName.toUpperCase()}_`;
}

function required(env: EnvMap, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing required deploy config value: ${key}`);
  return value;
}

function positiveInteger(env: EnvMap, key: string, fallback: number) {
  const rawValue = env[key]?.trim();
  if (!rawValue) return fallback;

  if (!POSITIVE_DECIMAL_INTEGER_PATTERN.test(rawValue)) {
    throw new Error(`Deploy config value ${key} must be a positive integer`);
  }

  return Number(rawValue);
}

function defaultServiceUser(ssh: string) {
  const match = ssh.match(/^([^@\s]+)@[^@\s]+$/);
  return match?.[1] || DEFAULT_SERVICE_USER;
}

function linuxAccountName(env: EnvMap, key: string, fallback: string) {
  const value = env[key]?.trim() || fallback;

  if (!LINUX_ACCOUNT_NAME_PATTERN.test(value)) {
    throw new Error(
      `Deploy config value ${key} must be a simple Linux account or group name: ${value}`,
    );
  }

  return value;
}

function serviceUserName(env: EnvMap, key: string, fallback: string) {
  const explicitValue = env[key]?.trim();
  const value = linuxAccountName(env, key, fallback);

  if (value === "root") {
    if (explicitValue) {
      throw new Error(`Deploy config value ${key} cannot be root; set a non-root service user`);
    }

    throw new Error(`Deploy SSH username resolved to root; set ${key} to a non-root service user for this site`);
  }

  return value;
}

export function parseDeploySite(env: EnvMap, siteName: string): DeploySite {
  const name = siteName.trim();
  if (!name) throw new Error("Deploy site name cannot be empty");

  const envPrefix = envPrefixForSite(name);
  const ssh = required(env, `${envPrefix}SSH`);
  const serviceUser = serviceUserName(env, `${envPrefix}SERVICE_USER`, defaultServiceUser(ssh));

  return {
    name,
    envPrefix,
    ssh,
    appRoot: env[`${envPrefix}APP_ROOT`]?.trim() || DEFAULT_APP_ROOT,
    serviceName: env[`${envPrefix}SERVICE_NAME`]?.trim() || DEFAULT_SERVICE_NAME,
    serviceUser,
    serviceGroup: linuxAccountName(env, `${envPrefix}SERVICE_GROUP`, serviceUser),
    port: positiveInteger(env, `${envPrefix}PORT`, DEFAULT_PORT),
    keepReleases: positiveInteger(env, `${envPrefix}KEEP_RELEASES`, DEFAULT_KEEP_RELEASES),
  };
}

export function parseDeployConfig(env: EnvMap = process.env): DeployConfig {
  const rawSites = required(env, "DEPLOY_SITES");
  const siteNames = rawSites.split(",").map((siteName) => siteName.trim());

  if (siteNames.some((siteName) => !siteName)) {
    throw new Error("DEPLOY_SITES must include site names separated by commas without empty entries");
  }

  return {
    sites: siteNames.map((siteName) => parseDeploySite(env, siteName)),
  };
}

export function findDeploySite(config: DeployConfig, siteName: string): DeploySite {
  const site = config.sites.find((candidate) => candidate.name === siteName);
  if (!site) {
    throw new Error(
      `Unknown deploy site "${siteName}". Available sites: ${config.sites
        .map((candidate) => candidate.name)
        .join(", ")}`,
    );
  }

  return site;
}
