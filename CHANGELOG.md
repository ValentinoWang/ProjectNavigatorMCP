# Changelog

## v0.1.0

Initial public release.

- Added the `pnav` CLI with `doctor`, `init`, `scan`, `map`, `capsule`, `memory`, `remember`, and `mcp` commands.
- Added a project-local SQLite index at `.pnav/project.sqlite`.
- Added repository scanning for files, commands, rules, symbols, imports, routes, tests, and Git co-change edges.
- Added nine MCP tools for repository maps, symbol search, related files, route tracing, impact analysis, test recommendations, task capsules, and project memory.
- Added a shared MCP response envelope with index status and warnings.
- Added `.pnav/config.json` support for include/exclude rules, domain boosts, source path boosts, max file size, and `.gitignore` handling.
- Added SQLite FTS-backed symbol and memory search.
- Added multi-hop graph traversal for impact analysis.
- Added structured project memory tags, decisions, pitfalls, validation notes, and confidence fields.
- Added tests for migrations, scanning, capsules, MCP tool contracts, config behavior, route parsing, and impact analysis.
- Added GitHub Actions CI for Node 20 and 22.
