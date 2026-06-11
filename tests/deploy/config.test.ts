import { describe, expect, it } from "vitest";
import { findDeploySite, parseDeployConfig, parseDeploySite } from "../../deploy/lib/config";

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
      serviceUser: "deploy",
      serviceGroup: "deploy",
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
        DEPLOY_OFFICE_SERVICE_USER: "task_runner",
        DEPLOY_OFFICE_SERVICE_GROUP: "task-runners",
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
      serviceUser: "task_runner",
      serviceGroup: "task-runners",
      port: 4300,
      keepReleases: 8,
    });
  });

  it("defaults service user and group from the SSH username", () => {
    const site = parseDeploySite(
      {
        DEPLOY_PRODUCTION_SSH: "deploy-user@example.com",
      },
      "production",
    );

    expect(site.serviceUser).toBe("deploy-user");
    expect(site.serviceGroup).toBe("deploy-user");
  });

  it("falls back to the default service identity for SSH host aliases", () => {
    const site = parseDeploySite(
      {
        DEPLOY_PRODUCTION_SSH: "production-host",
      },
      "production",
    );

    expect(site.serviceUser).toBe("web-ui-task-manager");
    expect(site.serviceGroup).toBe("web-ui-task-manager");
  });

  it("rejects invalid service users", () => {
    expect(() =>
      parseDeploySite(
        {
          DEPLOY_PRODUCTION_SSH: "deploy@example.com",
          DEPLOY_PRODUCTION_SERVICE_USER: "9deploy",
        },
        "production",
      ),
    ).toThrow(/DEPLOY_PRODUCTION_SERVICE_USER/);
  });

  it("rejects root derived from the SSH username as a service user", () => {
    expect(() =>
      parseDeploySite(
        {
          DEPLOY_PRODUCTION_SSH: "root@example.com",
        },
        "production",
      ),
    ).toThrow(/set DEPLOY_PRODUCTION_SERVICE_USER to a non-root service user/);
  });

  it("rejects explicit root service users", () => {
    expect(() =>
      parseDeploySite(
        {
          DEPLOY_PRODUCTION_SSH: "deploy@example.com",
          DEPLOY_PRODUCTION_SERVICE_USER: "root",
        },
        "production",
      ),
    ).toThrow(/DEPLOY_PRODUCTION_SERVICE_USER/);
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

  it("rejects empty site list entries", () => {
    expect(() =>
      parseDeployConfig({
        DEPLOY_SITES: "production,,office",
        DEPLOY_PRODUCTION_SSH: "deploy@example.com",
        DEPLOY_OFFICE_SSH: "app@office.example.com",
      }),
    ).toThrow(/DEPLOY_SITES/);
  });

  it("rejects trailing site list commas", () => {
    expect(() =>
      parseDeployConfig({
        DEPLOY_SITES: "production,",
        DEPLOY_PRODUCTION_SSH: "deploy@example.com",
      }),
    ).toThrow(/DEPLOY_SITES/);
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

  it("rejects non-decimal numeric values", () => {
    expect(() =>
      parseDeploySite(
        {
          DEPLOY_PRODUCTION_SSH: "deploy@example.com",
          DEPLOY_PRODUCTION_PORT: "1e3",
        },
        "production",
      ),
    ).toThrow(/DEPLOY_PRODUCTION_PORT/);

    expect(() =>
      parseDeploySite(
        {
          DEPLOY_PRODUCTION_SSH: "deploy@example.com",
          DEPLOY_PRODUCTION_KEEP_RELEASES: "0x5",
        },
        "production",
      ),
    ).toThrow(/DEPLOY_PRODUCTION_KEEP_RELEASES/);

    expect(() =>
      parseDeploySite(
        {
          DEPLOY_PRODUCTION_SSH: "deploy@example.com",
          DEPLOY_PRODUCTION_PORT: "3000.0",
        },
        "production",
      ),
    ).toThrow(/DEPLOY_PRODUCTION_PORT/);
  });

  it("finds a configured deploy site", () => {
    const config = parseDeployConfig({
      DEPLOY_SITES: "production,office",
      DEPLOY_PRODUCTION_SSH: "deploy@example.com",
      DEPLOY_OFFICE_SSH: "app@office.example.com",
    });

    expect(findDeploySite(config, "office")).toEqual({
      name: "office",
      envPrefix: "DEPLOY_OFFICE_",
      ssh: "app@office.example.com",
      appRoot: "/opt/web-ui-task-manager",
      serviceName: "web-ui-task-manager",
      serviceUser: "app",
      serviceGroup: "app",
      port: 3000,
      keepReleases: 5,
    });
  });

  it("rejects unknown deploy sites", () => {
    const config = parseDeployConfig({
      DEPLOY_SITES: "production,office",
      DEPLOY_PRODUCTION_SSH: "deploy@example.com",
      DEPLOY_OFFICE_SSH: "app@office.example.com",
    });

    expect(() => findDeploySite(config, "staging")).toThrow(/Unknown deploy site "staging"/);
  });
});
