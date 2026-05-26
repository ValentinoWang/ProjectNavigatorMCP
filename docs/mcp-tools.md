# MCP Tools

ProjectNavigatorMCP exposes repository intelligence to Codex, Claude Code, and other MCP clients.

Server command:

```bash
pnav mcp <repo>
```

Example:

```bash
pnav mcp /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
```

The MCP server reads the project-local index:

```text
<repo>/.pnav/project.sqlite
```

## Shared Envelope

All MCP tools return a JSON string inside MCP text content. The JSON always uses this envelope:

```json
{
  "repo": "flutter-transfer",
  "generated_at": "2026-05-26T00:00:00.000Z",
  "index_status": {
    "scanned": true,
    "git_sha": "abc123",
    "current_git_sha": "abc123",
    "stale": false
  },
  "data": {},
  "warnings": []
}
```

`index_status.scanned` is false when the repository has not been scanned yet. `stale` is true when the latest stored scan SHA differs from the current Git SHA.

Scores are relevance values. Confidence describes relationship reliability.

## Tools

### `repo_map`

Input:

```json
{}
```

Data shape:

```json
{
  "repo": "flutter-transfer",
  "rootPath": "/path/to/flutter-transfer",
  "gitSha": "abc123",
  "languages": [{"language": "dart", "files": 2512}],
  "counts": {"files": 5523, "symbols": 34985, "routes": 495, "tests": 810, "commands": 104, "rules": 300, "memories": 2},
  "importantPaths": ["AGENTS.md", "README.md", "Makefile"],
  "commands": [{"name": "test", "command": "make test", "sourceFile": "Makefile", "category": "test"}],
  "recentScanStatus": "completed"
}
```

### `find_symbol`

Input:

```json
{"query": "IdentityController", "limit": 10}
```

Data shape:

```json
{
  "matches": [
    {
      "name": "IdentityController",
      "kind": "class",
      "signature": "class IdentityController",
      "qualifiedName": "IdentityController",
      "path": "lib/core/identity/identity_controller.dart",
      "startLine": 12,
      "endLine": 12,
      "score": 0.92
    }
  ]
}
```

### `find_related_files`

Input:

```json
{"task": "修复 microplan 页面滚动问题", "limit": 20}
```

Data shape:

```json
{
  "files": [
    {
      "path": "lib/modules/workspace/pages/microplan_page.dart",
      "language": "dart",
      "score": 0.88,
      "reason": "Path, symbols, or configured domains match the task."
    }
  ]
}
```

### `trace_route`

Input:

```json
{"query": "workspaceMicroplan", "limit": 20}
```

Data shape:

```json
{
  "routes": [
    {
      "framework": "flutter_go_router",
      "method": null,
      "path": "/workspace/microplan",
      "name": "workspaceMicroplan",
      "routeFile": "lib/core/router/app_router.dart",
      "targetSymbol": "workspaceMicroplan"
    }
  ]
}
```

### `impact_analysis`

Input:

```json
{"target": "lib/core/identity/identity_controller.dart", "depth": 2, "direction": "both"}
```

`direction` can be `upstream`, `downstream`, or `both`.

Data shape:

```json
{
  "target": "lib/core/identity/identity_controller.dart",
  "impactedFiles": [
    {
      "path": "test/core/identity/identity_controller_test.dart",
      "relationship": "covered_by",
      "distance": 1,
      "score": 0.9,
      "confidence": 0.9,
      "pathChain": [
        "lib/core/identity/identity_controller.dart --covered_by--> test/core/identity/identity_controller_test.dart"
      ]
    }
  ],
  "risks": ["Review direct imports, related tests, and Git co-change neighbors before editing."]
}
```

### `related_tests`

Input:

```json
{"changedFiles": ["lib/core/identity/identity_controller.dart"], "task": "fix identity login"}
```

Data shape:

```json
{
  "commands": [{"name": "test", "command": "make test", "sourceFile": "Makefile", "category": "test", "confidence": 0.86}],
  "testFiles": ["test/core/identity/identity_controller_test.dart"]
}
```

### `prepare_task_context`

Input:

```json
{
  "task": "修复 microplan 页面滚动问题",
  "maxFiles": 20,
  "maxSymbols": 12,
  "includeMemory": true,
  "includeRules": true
}
```

Data shape:

```json
{
  "task": "修复 microplan 页面滚动问题",
  "readOrder": [{"path": "lib/modules/workspace/pages/microplan_page.dart", "why": "Likely relevant file"}],
  "relatedFiles": [],
  "symbols": [],
  "routes": [],
  "relatedTests": {"commands": [], "testFiles": []},
  "projectRules": [],
  "memoryHits": [],
  "nextSteps": []
}
```

### `search_project_memory`

Input:

```json
{"query": "identity token refresh", "limit": 10}
```

Data shape:

```json
{
  "memories": [
    {
      "id": 12,
      "topic": "Fix identity token refresh",
      "summary": "Token refresh failed because...",
      "files": [],
      "commands": [],
      "tags": ["identity", "token"],
      "memoryType": "task",
      "confidence": 1,
      "score": 0.91,
      "createdAt": "2026-05-26 00:00:00"
    }
  ]
}
```

### `remember_task`

Input:

```json
{
  "title": "Fix identity token refresh",
  "summary": "Token refresh failed because...",
  "changedFiles": ["lib/core/identity/identity_controller.dart"],
  "tests": ["flutter test test/core/identity/identity_controller_test.dart"],
  "tags": ["identity", "token"],
  "decisions": ["Keep refresh handling inside identity controller."],
  "pitfalls": ["Do not skip role-specific workspace checks."],
  "validation": ["flutter test passed"]
}
```

Data shape:

```json
{"stored": true, "memoryId": 12}
```
