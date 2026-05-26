# Roadmap

## v0.1

Stabilize the local Repository Intelligence MCP loop:

- CLI and MCP server.
- Project-local SQLite index.
- File, symbol, import, route, command, rule, test, and Git co-change scanning.
- Unified MCP response envelope.
- Configurable include/exclude and relevance rules.
- FTS-backed search for symbols and project memory.
- Multi-hop impact analysis.
- Flutter target repository validation.

## v0.2

Improve scanner accuracy:

- Richer Dart, TypeScript, JavaScript, and Python symbol extraction.
- Better qualified names and signatures.
- FastAPI router prefix support.
- More import alias resolution.
- Incremental scanning by file hash.

## v0.3

Improve agent handoff quality:

- Explicit token budgets.
- Stronger read order planning.
- Impact previews inside task capsules.
- Structured verification plans.
- More precise test command ranking.

## v0.4

Add optional language intelligence backends:

- Tree-sitter parser adapters.
- LSP-assisted definition/reference lookup.
- SCIP import support where available.

## v1.0

Make the tool stable for external open-source users:

- Versioned output contracts.
- Backward-compatible migrations.
- Broader fixture coverage.
- Real-world examples across Flutter, Node, Python, and monorepos.
