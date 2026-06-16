import { assertChangelogHasVersion } from "../lib/changelog";
import { readPackageVersion } from "../lib/packageVersion";

try {
  const version = readPackageVersion();
  assertChangelogHasVersion(version);
  console.log(`CHANGELOG.md contains an entry for ${version}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
