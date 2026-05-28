# Architecture

## 中文架构总览

本次同步范围：在《架构文档》中补充 Mermaid 架构图，并同步更新《输出契约》、
《MCP 工具文档》、《生产评测文档》、《README》、《开发计划》和示例评测套件。

```mermaid
flowchart TB
  User["使用者\nCodex / Claude Code / 人类开发者"]

  subgraph Entry["入口层"]
    CLI["pnav CLI\npnav scan / discover / eval"]
    MCP["pnav MCP server\ndiscover_code / production_discovery_eval"]
  end

  subgraph Repo["目标仓库"]
    Source["源码、测试、文档、脚本"]
    Rules["仓库规则\nAGENTS.md / README / docs / skills"]
    RepoProfile["持久 workflow profile\n.agents/pnav/workflow-profiles.json"]
    LocalProfile["本地 override profile\n.pnav/workflow-profiles.json"]
    SQLite["本地索引数据库\n.pnav/project.sqlite"]
  end

  subgraph Scanner["扫描与索引"]
    FileScan["文件与语言扫描"]
    RuleScan["规则扫描"]
    CommandScan["命令扫描"]
    SymbolScan["符号与 import 扫描"]
    GitScan["Git sha 与 co-change 扫描"]
  end

  subgraph Discovery["Discovery 生产导航"]
    Related["相关文件、入口、符号、复用候选"]
    ProfileResolver["workflow profile 解析\n优先 .agents/pnav\n其次 .pnav\n最后 built-in fallback"]
    Ranker["确定性排序与噪声压制"]
    StrictGate["Strict MustRead Gate\n最多 5 个 mustRead\nsupporting/suppressed 给出原因"]
  end

  subgraph Handoff["结构化交接"]
    MustRead["authoritativeHandoff.mustRead\n先读的主路径"]
    Supporting["supportingContext / suppressedCandidates\n辅助上下文与压制原因"]
    Protocol["workflowProtocol\nprofiles / actions / commands\nnewFileExpectations / editPolicies / gateSteps"]
  end

  subgraph Consumers["消费与验收"]
    Agent["AI agent 执行任务\n按 action / command / gate 开工"]
    StrictEval["strict production eval\n断言 mustRead、顺序、actions、commands、new files、read-only、gate steps"]
    Docs["文档与示例\noutput contract / MCP docs / production eval / README / development plan / suite"]
  end

  User --> CLI
  User --> MCP
  CLI --> Source
  MCP --> SQLite
  Source --> FileScan
  Source --> RuleScan
  Source --> CommandScan
  Source --> SymbolScan
  Source --> GitScan
  Rules --> RuleScan
  FileScan --> SQLite
  RuleScan --> SQLite
  CommandScan --> SQLite
  SymbolScan --> SQLite
  GitScan --> SQLite
  SQLite --> Related
  RepoProfile --> ProfileResolver
  LocalProfile --> ProfileResolver
  ProfileResolver --> Ranker
  Related --> Ranker
  Ranker --> StrictGate
  StrictGate --> MustRead
  StrictGate --> Supporting
  ProfileResolver --> Protocol
  MustRead --> Agent
  Supporting --> Agent
  Protocol --> Agent
  Protocol --> StrictEval
  MustRead --> StrictEval
  Supporting --> StrictEval
  Protocol --> Docs
```

关键约束：

- `mustRead` 和 `supportingContext` 只接收目标仓库中已经存在的文件。
- 未来文件、证据目录、migration pair、临时反例记录放入 `newFileExpectations`。
- generated SDK 等生成物通过 `editPolicies` 标记为 `read_only`，由推荐命令生成。
- strict eval 不只检查平均分，也检查读文件顺序、warning、action、command、new file、
  read-only policy、gate step 和 profile source。

ProjectNavigatorMCP has two responsibilities:

1. Provide a globally installable CLI and MCP server named `pnav`.
2. Maintain a project-local repository intelligence database inside each target repository.

The target repository's business database is not used. ProjectNavigatorMCP stores its own
analysis data in:

```text
<target-repo>/.pnav/project.sqlite
```

## Architecture Summary

```mermaid
flowchart LR
  Human["Human developer"] --> CLI["pnav CLI"]
  Agent["Codex / Claude Code"] --> MCP["pnav MCP server"]

  CLI --> Repo["Target Git repo"]
  MCP --> DB[".pnav/project.sqlite"]

  Repo --> Scanner["Scanner pipeline"]
  Scanner --> DB

  Scanner --> FileScan["Files + languages"]
  Scanner --> GitScan["Git sha + co-change"]
  Scanner --> RuleScan["AGENTS / CLAUDE / README rules"]
  Scanner --> CommandScan["Makefile / package / pubspec / pyproject commands"]
  Scanner --> SymbolScan["Symbols + imports"]

  DB --> Graph["Graph query layer"]
  Graph --> Tools["MCP tools"]
  Graph --> Capsule["Task context capsule"]
  Graph --> Memory["Project memory"]
```

## Discovery Workflow Protocol

```mermaid
flowchart LR
  Scanner["Scanner pipeline"] --> SQLite[".pnav/project.sqlite"]
  SQLite --> Discovery["Discovery ranking"]
  RepoProfiles["Repo-local workflow profiles\n.agents/pnav/workflow-profiles.json\n.pnav/workflow-profiles.json"] --> Discovery
  BuiltInProfiles["Built-in fallback profiles"] --> Discovery
  Discovery --> StrictHandoff["authoritativeHandoff\nmustRead + supportingContext"]
  StrictHandoff --> WorkflowProtocol["workflowProtocol\nactions + commands + new files\nedit policies + gate steps"]
  WorkflowProtocol --> MCP["discover_code MCP"]
  WorkflowProtocol --> CLI["pnav discover"]
  WorkflowProtocol --> Eval["strict production eval"]
```

Workflow profiles are resolved from the target repository before built-in fallbacks. Existing
files may enter `mustRead` and `supportingContext`; future artifacts such as evidence
directories, migration pairs, and counterexample notes belong in `newFileExpectations`.

## Runtime Modes

### CLI Mode

Used by humans, scripts, and acceptance tests.

```bash
pnav doctor
pnav init <repo>
pnav scan <repo>
pnav map <repo>
pnav capsule <repo> "<task>"
pnav mcp <repo>
```

### MCP Mode

Used by Codex, Claude Code, or other MCP clients.

```bash
pnav mcp <repo>
```

The MCP server opens:

```text
<repo>/.pnav/project.sqlite
```

and exposes repository intelligence tools.

The MCP server should not rescan the whole repository automatically on every tool call.
Scanning belongs to `pnav scan <repo>` or to a future explicit `refresh_index` tool.

## Storage Model

SQLite is the MVP storage engine.

It stores:

- repository metadata
- scan runs
- files
- symbols
- graph edges
- commands
- project rules
- memories
- tasks

SQLite is chosen because it is local, portable, inspectable, and requires no daemon.

Postgres is a future option only when one of these becomes necessary:

- team-shared project memory
- web dashboard
- multi-project analytics
- permissions and audit logs
- SaaS deployment

## Graph Model

Use a generic `edges` table:

```text
from node -> edge kind -> to node
```

Initial node types:

- `file`
- `symbol`
- `command`
- `rule`
- `memory`
- `task`

Initial edge kinds:

- `contains`: file contains symbol
- `imports`: file imports file
- `references`: file or symbol references another symbol
- `routes_to`: route maps to page or handler
- `covered_by`: source file likely covered by test file
- `co_changes`: files often change together in Git history
- `mentions`: document/rule/memory mentions file, symbol, or command

MVP can delay precise `calls` edges. It is better to ship a reliable partial graph than a
fragile call graph.

## Query Strategy

Avoid plain BFS as the main product behavior. Use weighted retrieval:

```text
score = path match + symbol match + rule match + command match + test relation + git co-change + memory match
```

The first version can be simple and deterministic. Later versions can add Tree-sitter,
LSP, SCIP, embeddings, or runtime traces.

## Scanner Pipeline

```mermaid
sequenceDiagram
  participant CLI as pnav scan
  participant DB as SQLite
  participant FS as File scanner
  participant Git as Git scanner
  participant Cmd as Command scanner
  participant Rules as Rule scanner
  participant Symbols as Symbol scanner

  CLI->>DB: open <repo>/.pnav/project.sqlite
  CLI->>DB: create scan_runs row
  CLI->>FS: list files with ignore rules
  FS->>DB: upsert files
  CLI->>Git: collect git sha and co-change pairs
  Git->>DB: upsert co_changes edges
  CLI->>Cmd: parse Makefile/package/pubspec/pyproject
  Cmd->>DB: upsert commands
  CLI->>Rules: parse AGENTS/CLAUDE/README/docs
  Rules->>DB: upsert project_rules
  CLI->>Symbols: parse basic symbols and imports
  Symbols->>DB: upsert symbols and edges
  CLI->>DB: mark scan run finished
```

## Context Capsule

The context capsule is the main product output. It turns repository intelligence into a
small handoff document for a coding agent.

It should include:

- task interpretation
- likely files
- entry points
- related symbols
- impact risks
- recommended tests and commands
- project rules
- memory hits
- suggested next steps

For production Discovery Mode, the context capsule should prefer `authoritativeHandoff`: a
strict handoff with capped `mustRead`, route-to-widget chain completeness, precise
suppression reasons, reuse affected callers, and test coverage evidence. Strict eval should
treat forbidden mustRead files, missing suppression reasons, over-budget mustRead, and
insufficient chain completeness as hard failures instead of relying only on weighted score.

## Future Enhancements

Add these only after MVP works end-to-end:

1. Tree-sitter collectors for more accurate symbols and imports.
2. Dart `analysis_server`, Pyright, or TypeScript language service for exact references.
3. SCIP import for precomputed code navigation indexes.
4. Background incremental scan based on Git status or a file watcher.
5. Postgres sync for team-shared memory.
6. Optional embeddings for fuzzy memory and task search.
