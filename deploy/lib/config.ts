export type DeploySite = {
  name: string;
  envPrefix: string;
  ssh: string;
  appRoot: string;
  serviceName: string;
  port: number;
  keepReleases: number;
};

export type DeployConfig = {
  sites: DeploySite[];
};

type EnvMap = Record<string, string | undefined>;

const DEFAULT_APP_ROOT = "/opt/web-ui-task-manager";
const DEFAULT_SERVICE_NAME = "web-ui-task-manager";
const DEFAULT_PORT = 3000;
const DEFAULT_KEEP_RELEASES = 5;
const SITE_NAME_PATTERN = /^[A-Za-z0-9_]+$/;

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

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Deploy config value ${key} must be a positive integer`);
  }

  return value;
}

export function parseDeploySite(env: EnvMap, siteName: string): DeploySite {
  const name = siteName.trim();
  if (!name) throw new Error("Deploy site name cannot be empty");

  const envPrefix = envPrefixForSite(name);

  return {
    name,
    envPrefix,
    ssh: required(env, `${envPrefix}SSH`),
    appRoot: env[`${envPrefix}APP_ROOT`]?.trim() || DEFAULT_APP_ROOT,
    serviceName: env[`${envPrefix}SERVICE_NAME`]?.trim() || DEFAULT_SERVICE_NAME,
    port: positiveInteger(env, `${envPrefix}PORT`, DEFAULT_PORT),
    keepReleases: positiveInteger(env, `${envPrefix}KEEP_RELEASES`, DEFAULT_KEEP_RELEASES),
  };
}

export function parseDeployConfig(env: EnvMap = process.env): DeployConfig {
  const rawSites = required(env, "DEPLOY_SITES");
  const siteNames = rawSites
    .split(",")
    .map((siteName) => siteName.trim())
    .filter(Boolean);

  if (siteNames.length === 0) {
    throw new Error("DEPLOY_SITES must include at least one site name");
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
