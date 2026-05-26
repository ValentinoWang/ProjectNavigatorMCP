# Codex MCP Config Example

Build and link the package first:

```bash
cd /Users/vsiyo/Desktop/Opensource_Tool/ProjectNavigatorMCP
npm install
npm run build
npm link
```

Prepare the target repository:

```bash
pnav init /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
pnav scan /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
```

Then add an MCP server entry that runs:

```bash
pnav mcp /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
```

When Codex starts inside the Flutter project, it can call:

- `repo_map`
- `prepare_task_context`
- `find_related_files`
- `impact_analysis`
- `related_tests`
- `remember_task`

Recommended first call for a task:

```json
{
  "tool": "prepare_task_context",
  "arguments": {
    "task": "修复 microplan 页面滚动问题",
    "maxFiles": 20,
    "maxSymbols": 12,
    "includeMemory": true,
    "includeRules": true
  }
}
```
