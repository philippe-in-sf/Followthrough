import fs from "node:fs";
import path from "node:path";

type PackageJson = {
  version?: unknown;
};

export function readPackageVersion(cwd = process.cwd()) {
  const packagePath = path.resolve(cwd, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as PackageJson;

  if (typeof packageJson.version !== "string" || !packageJson.version.trim()) {
    throw new Error(`Missing package version in ${packagePath}`);
  }

  return packageJson.version;
}
