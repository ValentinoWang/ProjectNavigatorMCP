import { readFileSync } from "node:fs";
import path from "node:path";

export interface ComponentApiFit {
  requiredParamsCovered: boolean;
  missingParams: string[];
  breakingChangeRisk: "low" | "medium" | "high";
  constructorParams: string[];
}

export function scanComponentApiFit(repoPath: string, filePath: string, symbol: string | null): ComponentApiFit {
  const content = safeRead(path.join(repoPath, filePath));
  const name = (symbol ?? "").split(".")[0];
  const ctorRegex = name ? new RegExp(`${escapeRegExp(name)}\\s*\\(([^)]*)\\)`) : null;
  const params = ctorRegex?.exec(content)?.[1] ?? "";
  const constructorParams = params
    .split(",")
    .map((param) => param.trim())
    .filter(Boolean);
  const requiredParams = constructorParams.filter(
    (param) => !param.includes("{") && !param.includes("[") && !param.includes("=")
  );
  return {
    requiredParamsCovered: requiredParams.length <= 2,
    missingParams:
      requiredParams.length > 2 ? requiredParams.slice(2).map((param) => param.replace(/^(required\s+)?/, "")) : [],
    breakingChangeRisk: requiredParams.length > 2 ? "medium" : "low",
    constructorParams
  };
}

function safeRead(filePath: string): string {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
