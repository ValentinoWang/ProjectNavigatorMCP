import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PACKAGE_NAME, PACKAGE_VERSION } from "../src/shared/packageInfo.js";

describe("package info", () => {
  it("stays in sync with package.json", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { name: string; version: string };

    expect(PACKAGE_NAME).toBe(packageJson.name);
    expect(PACKAGE_VERSION).toBe(packageJson.version);
  });
});
