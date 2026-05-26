import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getProjectPaths } from "../shared/paths.js";

export interface DomainConfig {
  name: string;
  keywords: string[];
  paths: string[];
  commands: string[];
}

export interface SourcePathBoost {
  pattern: string;
  boost: number;
}

export interface ProjectConfig {
  version: number;
  repoRoot: string;
  include: string[];
  exclude: string[];
  maxFileBytes: number;
  respectGitignore: boolean;
  domains: DomainConfig[];
  sourcePathBoosts: SourcePathBoost[];
}

export function defaultProjectConfig(repoRoot: string): ProjectConfig {
  return {
    version: 2,
    repoRoot,
    include: ["**/*"],
    exclude: [
      ".git/**",
      "node_modules/**",
      "build/**",
      "dist/**",
      ".dart_tool/**",
      ".venv/**",
      "venv/**",
      "env/**",
      "coverage/**",
      ".pnav/**",
      ".mypy_cache/**",
      ".tmp/**",
      ".cache/**",
      ".ruff_cache/**",
      "__pycache__/**",
      ".pytest_cache/**",
      "**/*.generated.*",
      "**/*.freezed.*"
    ],
    maxFileBytes: 1_500_000,
    respectGitignore: true,
    domains: [
      {
        name: "auth",
        keywords: ["auth", "identity", "login", "permission", "role", "登录", "身份", "权限"],
        paths: ["**/auth/**", "**/identity/**", "**/*auth*", "**/*identity*"],
        commands: ["*auth*", "*identity*", "*permission*", "*role*"]
      },
      {
        name: "api-contract",
        keywords: ["api", "contract", "openapi", "schema", "sdk", "接口", "字段", "契约"],
        paths: ["**/api/**", "**/schemas/**", "**/schema/**", "**/openapi/**", "**/*api*", "**/*schema*"],
        commands: ["*api*", "*openapi*", "*sdk*", "*contract*", "*schema*", "*gen*"]
      },
      {
        name: "ui-layout",
        keywords: ["ui", "layout", "widget", "route", "scroll", "sliver", "页面", "滚动", "布局"],
        paths: ["**/lib/**", "**/src/**", "**/ui/**", "**/widgets/**", "**/pages/**", "**/routes/**"],
        commands: ["*flutter*", "*frontend*", "*layout*", "*visual*", "*sliver*", "*golden*"]
      },
      {
        name: "tests",
        keywords: ["test", "guard", "验收", "测试"],
        paths: ["**/test/**", "**/tests/**", "**/*test*", "**/*spec*"],
        commands: ["*test*", "*guard*", "*lint*", "*analyze*", "*typecheck*"]
      }
    ],
    sourcePathBoosts: [
      { pattern: "src/**", boost: 0.14 },
      { pattern: "lib/**", boost: 0.14 },
      { pattern: "app/**", boost: 0.12 },
      { pattern: "packages/**", boost: 0.1 },
      { pattern: "frontend/lib/**", boost: 0.18 },
      { pattern: "backend/app/**", boost: 0.18 },
      { pattern: "backend/repositories/**", boost: 0.16 },
      { pattern: "shared/api/**", boost: 0.16 },
      { pattern: "test/**", boost: 0.08 },
      { pattern: "tests/**", boost: 0.08 },
      { pattern: "frontend/test/**", boost: 0.08 },
      { pattern: "backend/tests/**", boost: 0.08 }
    ]
  };
}

export function loadProjectConfig(repoPath: string): ProjectConfig {
  const paths = getProjectPaths(repoPath);
  const defaults = defaultProjectConfig(paths.repoRoot);
  if (!existsSync(paths.configPath)) {
    return defaults;
  }

  const parsed = JSON.parse(readFileSync(paths.configPath, "utf8")) as Partial<ProjectConfig>;
  return {
    ...defaults,
    ...parsed,
    repoRoot: paths.repoRoot,
    include: parsed.include ?? defaults.include,
    exclude: parsed.exclude ?? defaults.exclude,
    maxFileBytes: parsed.maxFileBytes ?? (parsed as { max_file_bytes?: number }).max_file_bytes ?? defaults.maxFileBytes,
    respectGitignore:
      parsed.respectGitignore ??
      (parsed as { respect_gitignore?: boolean }).respect_gitignore ??
      defaults.respectGitignore,
    domains: parsed.domains ?? defaults.domains,
    sourcePathBoosts:
      parsed.sourcePathBoosts ??
      (parsed as { source_path_boosts?: SourcePathBoost[] }).source_path_boosts ??
      defaults.sourcePathBoosts
  };
}

export function matchesAnyPattern(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPattern(value, pattern));
}

export function matchesPattern(value: string, pattern: string): boolean {
  const normalizedValue = value.split(path.sep).join("/");
  const normalizedPattern = pattern.split(path.sep).join("/");
  if (normalizedPattern === "**/*" || normalizedPattern === "**") {
    return true;
  }
  if (normalizedPattern.startsWith("**/") && matchesPattern(normalizedValue, normalizedPattern.slice(3))) {
    return true;
  }
  const escaped = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`).test(normalizedValue);
}
