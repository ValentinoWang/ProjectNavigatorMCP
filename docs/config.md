# Configuration

ProjectNavigatorMCP reads optional project-local configuration from:

```text
<repo>/.pnav/config.json
```

`pnav init <repo>` creates a default config. The defaults are intentionally local and safe: they ignore build output, dependency folders, generated files, `.pnav/`, and common cache directories.

## Example

```json
{
  "include": ["src/**", "lib/**", "app/**", "test/**", "tests/**", "README.md", "AGENTS.md", "CLAUDE.md"],
  "exclude": ["node_modules/**", "dist/**", "build/**", ".pnav/**", "**/*.generated.*", "**/*.freezed.*"],
  "max_file_bytes": 1500000,
  "respect_gitignore": true,
  "domains": [
    {
      "name": "billing",
      "keywords": ["billing", "invoice", "payment", "发票", "支付"],
      "paths": ["src/billing/**", "lib/billing/**"],
      "commands": ["*billing*", "*payment*", "*test*"]
    }
  ],
  "source_path_boosts": [
    { "pattern": "src/**", "boost": 0.14 },
    { "pattern": "lib/**", "boost": 0.14 },
    { "pattern": "test/**", "boost": 0.08 }
  ]
}
```

Both camelCase and snake_case are accepted for `maxFileBytes` / `max_file_bytes`, `respectGitignore` / `respect_gitignore`, and `sourcePathBoosts` / `source_path_boosts`.

## Fields

- `include`: file globs to scan. Default is `["**/*"]`.
- `exclude`: file globs to skip.
- `max_file_bytes`: maximum file size read by the scanner.
- `respect_gitignore`: whether common `.gitignore` rules should be applied.
- `domains`: task-specific relevance hints. This replaces hardcoded business rules.
- `source_path_boosts`: path-level boosts used by related file and test recommendation.

Configuration is advisory. It improves ranking and file selection; it does not change target project code.
