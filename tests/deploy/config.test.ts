import { describe, expect, it } from "vitest";
import { parseDeployConfig, parseDeploySite } from "../../deploy/lib/config";

describe("deploy config", () => {
  it("parses a site with defaults", () => {
    const site = parseDeploySite(
      {
        DEPLOY_PRODUCTION_SSH: "deploy@example.com",
      },
      "production",
    );

    expect(site).toEqual({
      name: "production",
      envPrefix: "DEPLOY_PRODUCTION_",
      ssh: "deploy@example.com",
      appRoot: "/opt/web-ui-task-manager",
      serviceName: "web-ui-task-manager",
      port: 3000,
      keepReleases: 5,
    });
  });

  it("parses explicit per-site values", () => {
    const site = parseDeploySite(
      {
        DEPLOY_OFFICE_SSH: "app@office.example.com",
        DEPLOY_OFFICE_APP_ROOT: "/srv/tasks",
        DEPLOY_OFFICE_SERVICE_NAME: "tasks-office",
        DEPLOY_OFFICE_PORT: "4300",
        DEPLOY_OFFICE_KEEP_RELEASES: "8",
      },
      "office",
    );

    expect(site).toEqual({
      name: "office",
      envPrefix: "DEPLOY_OFFICE_",
      ssh: "app@office.example.com",
      appRoot: "/srv/tasks",
      serviceName: "tasks-office",
      port: 4300,
      keepReleases: 8,
    });
  });

  it("parses the configured site list in order", () => {
    const config = parseDeployConfig({
      DEPLOY_SITES: "production, office",
      DEPLOY_PRODUCTION_SSH: "deploy@example.com",
      DEPLOY_OFFICE_SSH: "app@office.example.com",
    });

    expect(config.sites.map((site) => site.name)).toEqual(["production", "office"]);
  });

  it("rejects missing site list", () => {
    expect(() => parseDeployConfig({})).toThrow(/DEPLOY_SITES/);
  });

  it("rejects missing SSH destination", () => {
    expect(() => parseDeploySite({}, "production")).toThrow(/DEPLOY_PRODUCTION_SSH/);
  });

  it("rejects unsafe site names", () => {
    expect(() => parseDeploySite({ DEPLOY_BAD_SITE_SSH: "deploy@example.com" }, "bad-site")).toThrow(
      /letters, numbers, and underscores/,
    );
  });

  it("rejects invalid numeric values", () => {
    expect(() =>
      parseDeploySite(
        {
          DEPLOY_PRODUCTION_SSH: "deploy@example.com",
          DEPLOY_PRODUCTION_PORT: "abc",
        },
        "production",
      ),
    ).toThrow(/DEPLOY_PRODUCTION_PORT/);

    expect(() =>
      parseDeploySite(
        {
          DEPLOY_PRODUCTION_SSH: "deploy@example.com",
          DEPLOY_PRODUCTION_KEEP_RELEASES: "0",
        },
        "production",
      ),
    ).toThrow(/DEPLOY_PRODUCTION_KEEP_RELEASES/);
  });
});
