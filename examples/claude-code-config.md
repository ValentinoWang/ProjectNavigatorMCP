# Claude Code MCP Config Example

Build and link the package:

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

Add an MCP server entry named `project-navigator` with this command:

```bash
pnav mcp /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
```

Suggested usage flow:

1. Ask `repo_map` for the current repository map.
2. Ask `prepare_task_context` before editing.
3. Ask `impact_analysis` for changed files.
4. Ask `related_tests` before validation.
5. Call `remember_task` after the change is delivered.
