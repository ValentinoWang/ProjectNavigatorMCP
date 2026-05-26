import path from "node:path";

const LANGUAGE_BY_EXTENSION = new Map<string, string>([
  [".dart", "dart"],
  [".py", "python"],
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".js", "javascript"],
  [".jsx", "javascript"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".sql", "sql"],
  [".md", "markdown"],
  [".json", "json"],
  [".yaml", "yaml"],
  [".yml", "yaml"],
  [".toml", "toml"],
  [".sh", "shell"],
  [".ps1", "powershell"]
]);

const TEXT_FILENAMES = new Set([
  "Makefile",
  "Dockerfile",
  "README",
  "AGENTS.md",
  "CLAUDE.md",
  "package.json",
  "pubspec.yaml",
  "pyproject.toml"
]);

const BINARY_OR_LOW_SIGNAL_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".heic",
  ".pdf",
  ".otf",
  ".ttf",
  ".zip",
  ".gz",
  ".tar",
  ".dump",
  ".sqlite",
  ".db",
  ".lock"
]);

export function detectLanguage(relativePath: string): string {
  const basename = path.basename(relativePath);
  if (TEXT_FILENAMES.has(basename)) {
    return basename === "Makefile" ? "makefile" : detectLanguageFromExtension(relativePath) ?? "text";
  }
  return detectLanguageFromExtension(relativePath) ?? "text";
}

export function isIndexableTextFile(relativePath: string): boolean {
  const basename = path.basename(relativePath);
  if (TEXT_FILENAMES.has(basename)) {
    return true;
  }
  const ext = path.extname(relativePath).toLowerCase();
  if (BINARY_OR_LOW_SIGNAL_EXTENSIONS.has(ext)) {
    return false;
  }
  return LANGUAGE_BY_EXTENSION.has(ext);
}

function detectLanguageFromExtension(relativePath: string): string | undefined {
  return LANGUAGE_BY_EXTENSION.get(path.extname(relativePath).toLowerCase());
}

