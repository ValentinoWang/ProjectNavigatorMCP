import { readFileSync } from "node:fs";

interface PackageJson {
  name?: string;
  version?: string;
}

const packageJson = readPackageJson();

export const PACKAGE_NAME = packageJson.name ?? "project-navigator-mcp";
export const PACKAGE_VERSION = packageJson.version ?? "0.0.0";

function readPackageJson(): PackageJson {
  try {
    return JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as PackageJson;
  } catch {
    return {};
  }
}
