# ProjectNavigatorMCP 中文开发文档

## 0. 一句话目标

ProjectNavigatorMCP 要做的是：

> 给每个 Git 项目生成一个 AI 可查询的代码地图和项目记忆库，并通过 MCP 提供给 Codex、Claude Code 等 coding agent 使用。

它的价值不是替 AI 写代码，而是让 AI 写代码前先能问：

```text
这个任务相关文件在哪？
入口函数或路由在哪？
谁调用了谁？
改这个文件可能影响哪些地方？
应该跑哪些测试？
这个项目以前有什么规则或踩坑记录？
```

## 1. 最重要的概念

### 1.1 Postgres / SQLite 在这里是什么？

这里的数据库不是目标项目的业务数据库。

它是 ProjectNavigatorMCP 自己的“代码地图数据库”，用来存：

- 文件列表
- 函数、类、方法、路由等 symbol
- import、contains、calls、covered_by、co_changes 等关系
- Makefile / pubspec / pyproject 里的命令
- AGENTS.md / CLAUDE.md / README 里的项目规则
- AI 做过的任务记忆

MVP 用 SQLite：

```text
<target-repo>/.pnav/project.sqlite
```

以后如果要做团队共享、权限、Web 后台或 SaaS，再考虑 Postgres。

### 1.2 我们是不是在做一个项目级 MCP？

是，但更准确地说：

> 我们在做一个通用的 Repository Intelligence MCP。它可以挂到不同项目上，然后每个项目生成自己的 `.pnav/project.sqlite`。

同一套 `pnav` 程序可以服务多个项目：

```text
pnav mcp /path/to/project-a
pnav mcp /path/to/project-b
pnav mcp /path/to/project-c
```

MCP tools 的名字是通用的，但返回内容根据项目不同而不同。

### 1.3 第一版不要追求什么？

第一版不要追求：

- 完美 AST 解析
- 完美调用链
- 全语言支持
- LSP / SCIP 深度集成
- 向量数据库
- Postgres 多租户
- Web 管理后台
- 自动替代 Codex / Claude Code 写代码

第一版最重要的是打通闭环：

```text
init -> scan -> store -> query -> mcp -> capsule -> memory
```

## 2. MVP 范围

### 2.1 必须做

MVP 必须交付：

1. 可以初始化目标项目：`pnav init <repo>`
2. 可以扫描目标项目：`pnav scan <repo>`
3. 可以输出项目地图：`pnav map <repo>`
4. 可以根据任务生成上下文包：`pnav capsule <repo> "<task>"`
5. 可以启动 MCP server：`pnav mcp <repo>`
6. 可以通过 MCP 查询文件、symbol、相关文件、影响范围、测试建议和项目记忆

### 2.2 暂时不做

MVP 暂时不做：

- 登录系统
- 多用户权限
- Web UI
- 云端同步
- Postgres
- 复杂向量检索
- 自动提交 PR
- 复杂 LSP/SCIP 集成

## 3. 推荐技术栈

当前仓库文档已经倾向 TypeScript / Node.js，这个方向可以继续。

建议：

```text
语言：TypeScript
运行时：Node.js
CLI：commander
MCP：@modelcontextprotocol/sdk
SQLite：better-sqlite3
文件扫描：fast-glob
Git 信息：simple-git 或 child_process 调 git
配置解析：yaml、toml
测试：vitest
```

Tree-sitter 可以作为第二阶段加入。第一阶段可以先用路径、文件名、正则和 Git 信息实现可用版本。

## 4. 目标目录结构

建议实现成：

```text
ProjectNavigatorMCP/
  package.json
  tsconfig.json
  vitest.config.ts
  AGENTS.md
  README.md
  DEVELOPMENT.zh-CN.md
  src/
    cli/
      index.ts
      commands/
        doctor.ts
        init.ts
        scan.ts
        map.ts
        capsule.ts
        mcp.ts
    db/
      connection.ts
      migrations.ts
      schema.sql
      repositories.ts
    scanner/
      scanRepo.ts
      fileScanner.ts
      gitScanner.ts
      commandScanner.ts
      ruleScanner.ts
      symbolScanner.ts
      dartScanner.ts
      pythonScanner.ts
      typescriptScanner.ts
    graph/
      repoMap.ts
      symbolSearch.ts
      relatedFiles.ts
      impactAnalysis.ts
      relatedTests.ts
      scoring.ts
    capsule/
      prepareTaskContext.ts
      renderCapsule.ts
    memory/
      searchMemory.ts
      rememberTask.ts
    mcp/
      server.ts
      tools.ts
      schemas.ts
    shared/
      paths.ts
      hashing.ts
      languages.ts
      logger.ts
  tests/
    fixtures/
      tiny-repo/
    db.test.ts
    scanner.test.ts
    graph.test.ts
    capsule.test.ts
    mcp-tools.test.ts
  docs/
    architecture.md
    development-plan.md
    mcp-tools.md
    documentation-change-guide.zh-CN.md
  examples/
    flutter-transfer/
      demo-queries.md
```

## 5. CLI 设计

### 5.1 `pnav doctor`

用途：检查本机环境。

输出内容：

- Node 版本
- Git 是否可用
- SQLite 是否可用
- 当前包版本
- 是否能写入目标目录

示例：

```bash
pnav doctor
```

### 5.2 `pnav init <repo>`

用途：在目标仓库创建 `.pnav/`。

应该创建：

```text
<repo>/.pnav/
  project.sqlite
  config.json
  cache/
```

`config.json` 示例：

```json
{
  "version": 1,
  "repoRoot": "/absolute/path/to/repo",
  "include": ["**/*"],
  "exclude": [
    ".git/**",
    "node_modules/**",
    "build/**",
    "dist/**",
    ".dart_tool/**",
    ".venv/**",
    "coverage/**",
    ".pnav/**"
  ]
}
```

### 5.3 `pnav scan <repo>`

用途：扫描目标项目，写入 SQLite。

扫描顺序建议：

```text
1. 打开 SQLite
2. 创建 scan_runs 记录
3. 扫描文件列表
4. 计算文件 hash
5. 跳过未变化文件
6. 识别语言
7. 提取 commands
8. 提取 project rules
9. 提取 symbols
10. 提取 imports / contains / covered_by / co_changes
11. 写入 edges
12. 标记 scan_runs 完成
```

第一版允许 symbol 和 calls 不完美，但文件、路径、命令、规则、测试推荐必须可用。

### 5.4 `pnav map <repo>`

用途：输出项目地图。

输出应该包含：

- repo 名称
- 主要语言和文件数量
- 重要目录
- 重要命令
- 最近扫描时间
- symbol 数量
- test 文件数量

### 5.5 `pnav capsule <repo> "<task>"`

用途：根据自然语言任务生成给 AI 的上下文包。

输出应该包含：

```text
Task
Interpretation
Likely Files
Entry Points
Related Symbols
Impact Risks
Recommended Tests / Commands
Project Rules
Memory Hits
Suggested Next Steps
```

这是一版产品的核心能力。

### 5.6 `pnav mcp <repo>`

用途：启动 MCP server，让 Codex / Claude Code 通过 MCP 调用工具。

注意：

- MCP server 不应该重新扫描全项目，除非工具明确请求。
- MCP server 默认只读 SQLite。
- `remember_task` 是写操作，需要写入 memories/tasks。

## 6. SQLite 数据库设计

### 6.1 核心表

建议 MVP schema：

```sql
CREATE TABLE repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  root_path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE scan_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL,
  git_sha TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  error TEXT,
  FOREIGN KEY(repo_id) REFERENCES repos(id)
);

CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL,
  path TEXT NOT NULL,
  language TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  hash TEXT,
  is_test INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  UNIQUE(repo_id, path),
  FOREIGN KEY(repo_id) REFERENCES repos(id)
);

CREATE TABLE symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL,
  file_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  start_line INTEGER,
  end_line INTEGER,
  parent_symbol_id INTEGER,
  signature TEXT,
  confidence REAL NOT NULL DEFAULT 0.7,
  FOREIGN KEY(repo_id) REFERENCES repos(id),
  FOREIGN KEY(file_id) REFERENCES files(id)
);

CREATE TABLE edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL,
  from_type TEXT NOT NULL,
  from_id INTEGER NOT NULL,
  to_type TEXT NOT NULL,
  to_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  confidence REAL NOT NULL DEFAULT 0.7,
  source TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(repo_id, from_type, from_id, to_type, to_id, kind),
  FOREIGN KEY(repo_id) REFERENCES repos(id)
);

CREATE TABLE commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  category TEXT,
  source_file TEXT,
  confidence REAL NOT NULL DEFAULT 0.7,
  FOREIGN KEY(repo_id) REFERENCES repos(id)
);

CREATE TABLE project_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL,
  source_file TEXT NOT NULL,
  rule TEXT NOT NULL,
  category TEXT,
  confidence REAL NOT NULL DEFAULT 0.7,
  FOREIGN KEY(repo_id) REFERENCES repos(id)
);

CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL,
  topic TEXT NOT NULL,
  summary TEXT NOT NULL,
  files_json TEXT,
  commands_json TEXT,
  tags_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(repo_id) REFERENCES repos(id)
);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  changed_files_json TEXT,
  tests_json TEXT,
  result TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(repo_id) REFERENCES repos(id)
);
```

### 6.2 推荐索引

```sql
CREATE INDEX idx_files_repo_path ON files(repo_id, path);
CREATE INDEX idx_symbols_repo_name ON symbols(repo_id, name);
CREATE INDEX idx_symbols_file ON symbols(file_id);
CREATE INDEX idx_edges_from ON edges(repo_id, from_type, from_id, kind);
CREATE INDEX idx_edges_to ON edges(repo_id, to_type, to_id, kind);
CREATE INDEX idx_commands_repo_name ON commands(repo_id, name);
CREATE INDEX idx_memories_repo_topic ON memories(repo_id, topic);
```

### 6.3 FTS 搜索

MVP 可以先不用复杂 embedding，用 SQLite FTS 即可。

建议后续添加：

```sql
CREATE VIRTUAL TABLE file_fts USING fts5(path, content='files', content_rowid='id');
CREATE VIRTUAL TABLE symbol_fts USING fts5(name, signature, content='symbols', content_rowid='id');
CREATE VIRTUAL TABLE memory_fts USING fts5(topic, summary, content='memories', content_rowid='id');
```

## 7. Scanner 设计

### 7.1 文件扫描

扫描时要排除：

```text
.git/**
.pnav/**
node_modules/**
dist/**
build/**
coverage/**
.dart_tool/**
.venv/**
__pycache__/**
```

语言识别先按扩展名：

```text
.dart -> dart
.py -> python
.ts/.tsx -> typescript
.js/.jsx -> javascript
.md -> markdown
.yaml/.yml -> yaml
.toml -> toml
.sql -> sql
```

### 7.2 命令扫描

优先扫描：

- `Makefile`
- `package.json`
- `frontend/pubspec.yaml`
- `pyproject.toml`
- `scripts/`
- `AGENTS.md` 中提到的命令

命令类别：

```text
analyze
lint
test
generate
build
ci
custom
```

### 7.3 规则扫描

优先扫描：

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/**/*.md`

规则类型：

```text
coding_rule
test_rule
architecture_rule
generated_code_rule
ui_rule
api_contract_rule
```

### 7.4 Symbol 扫描

第一版可以用简化解析。

Dart 先识别：

- `class X`
- `enum X`
- `mixin X`
- `typedef X`
- `Widget build(`
- 顶层函数
- 方法名

Python 先识别：

- `class X`
- `def x(`
- `async def x(`
- FastAPI router 装饰器附近的 handler

TypeScript 先识别：

- `function x(`
- `class X`
- `interface X`
- `const x = (`
- `export function`

Tree-sitter 可以后续替换这些简化 scanner。

### 7.5 关系扫描

MVP 关系类型：

```text
contains      file contains symbol
imports       file imports file
covered_by    source file likely covered by test file
co_changes    files often changed together in Git history
mentions      rule/doc mentions file or symbol
routes_to     route maps to handler/page
```

`calls` 可以延后，或者只做低置信度的文本匹配。

## 8. 相关性打分

`find_related_files` 和 `prepare_task_context` 的核心不是 BFS，而是“多信号打分”。

第一版可以用简单加权：

```text
score =
  path_keyword_score * 0.35
+ symbol_keyword_score * 0.25
+ command_rule_score * 0.15
+ test_relation_score * 0.10
+ git_cochange_score * 0.10
+ memory_score * 0.05
```

中文任务要先做简单关键词拆分。

例如：

```text
修复 workspace microplan 页面滚动问题
```

关键词可以是：

```text
workspace
microplan
scroll
滚动
页面
```

然后匹配：

- 文件路径
- symbol 名称
- route 名称
- command 名称
- memory summary
- project rules

## 9. MCP Tools

MVP MCP tools 建议固定为 9 个。

### 9.1 `repo_map`

返回项目地图。

### 9.2 `find_symbol`

按名称查 symbol。

### 9.3 `find_related_files`

根据自然语言任务查相关文件。

### 9.4 `trace_route`

查 Flutter route 或 FastAPI endpoint 的入口和目标文件。

### 9.5 `impact_analysis`

根据文件或 symbol 估算影响范围。

### 9.6 `related_tests`

根据任务或改动文件推荐测试命令和测试文件。

### 9.7 `prepare_task_context`

生成给 Codex / Claude Code 的上下文包。

这是最核心的工具。

### 9.8 `search_project_memory`

查历史任务和项目记忆。

### 9.9 `remember_task`

记录一次完成的任务。

详细输入输出以 `docs/mcp-tools.md` 为准。

## 10. Context Capsule 输出格式

`pnav capsule` 和 `prepare_task_context` 应该返回同一类内容。

推荐 Markdown 格式：

```md
# Task Context Capsule

## Task

修复 workspace microplan 页面滚动问题

## Interpretation

这是一个 Flutter UI / layout 问题，可能涉及 workspace microplan 页面、路由入口、滚动容器和响应式宽度规则。

## Likely Files

| path                                     | reason                      | score |
| ---------------------------------------- | --------------------------- | ----: |
| frontend/lib/modules/workspace/...       | path and task keyword match |  0.88 |
| frontend/lib/core/router/app_router.dart | route entry point           |  0.71 |

## Entry Points

- frontend/lib/core/router/app_router.dart
- workspace microplan route/page symbols if found

## Impact Risks

- nested scroll / sliver constraint mismatch
- responsive width behavior may change
- existing workspace tests may fail

## Recommended Commands

- make workspace-microplan-scroll-guard
- make flutter-sliver-contract-guard
- make frontend-analyze

## Project Rules

- UI changes should consider 360 / 390 / 768 / 1024 / 1280 / 1440 widths.
- Do not weaken tests or bypass gates.

## Memory Hits

- none / list of related memories

## Suggested Next Steps for Agent

1. Inspect likely files first.
2. Confirm route and widget entry.
3. Make minimal layout fix.
4. Run recommended commands.
5. Record task memory after completion.
```

## 11. 项目记忆设计

项目记忆不要存成普通聊天记录。

一次 memory 至少包含：

```text
topic
summary
related files
related commands
tags
created_at
updated_at
```

建议主题例子：

```text
workspace microplan scroll
identity switching
openapi sdk generation
flutter responsive width rules
```

记忆写入原则：

- 只记录经过验证的结论。
- 记录为什么这样做，不只记录改了什么。
- 记录相关测试和命令。
- 记录下次遇到类似问题要注意什么。

## 12. 开发里程碑

### v0.3 Milestones：Execution-Ready Project Secretary

v0.3 的主线不是 scanner accuracy，而是执行型项目秘书：

1. Guard Rule Registry：把 Guard 失败映射到 rule id、domain、canonical paths、repair recipe 和 validation commands。
2. Task Domain + Domain Gate：前端设计系统任务压低 backend/database/infra 和无关命令，但不隐藏显式证据。
3. Execution Plan Reranker：把方案文档和 Guard 命令压缩成默认 5-8 步。
4. Worktree Boundary：输出 allowedEditFiles、preExistingDirtyFiles、riskyDirtyFiles 和 verifyDiffCommands。
5. Source Doc Infer Mode：无 frontmatter 文档也能提取路径和命令，但降低 confidence 并输出 warning。
6. record_task_result / pnav finish：任务完成后自动沉淀 guard、diff、验证命令和结果记忆。
7. Real flutter-transfer Regression：用角色视觉设计系统一致性治理方案验证低噪声执行路径。

### Milestone 1：文档和项目骨架

交付：

- `package.json`
- `tsconfig.json`
- `src/` 目录
- `tests/fixtures/tiny-repo`
- CLI 能输出 help

验收：

```bash
pnpm install
pnpm test
pnpm pnav doctor
```

### Milestone 2：SQLite 初始化

交付：

- migration 系统
- schema
- `pnav init <repo>`

验收：

```bash
pnav init tests/fixtures/tiny-repo
ls tests/fixtures/tiny-repo/.pnav/project.sqlite
```

### Milestone 3：文件、命令、规则扫描

交付：

- file scanner
- language detector
- command scanner
- project rule scanner
- `pnav scan <repo>`
- `pnav map <repo>`

验收：

```bash
pnav scan tests/fixtures/tiny-repo
pnav map tests/fixtures/tiny-repo
```

输出要包含文件数量、语言、命令、重要路径。

### Milestone 4：Symbol 和基础关系

交付：

- Dart/Python/TypeScript 简化 symbol scanner
- `contains` edges
- `imports` edges
- `covered_by` test relation
- `co_changes` Git relation

验收：

```bash
pnav map tests/fixtures/tiny-repo
```

输出要能展示 symbol 数量和测试文件数量。

### Milestone 5：Graph 查询

交付：

- `repo_map`
- `find_symbol`
- `find_related_files`
- `impact_analysis`
- `related_tests`

验收：

```bash
pnav capsule tests/fixtures/tiny-repo "修改登录身份切换逻辑"
```

输出要有相关文件、测试建议、风险说明。

### Milestone 6：MCP Server

交付：

- `pnav mcp <repo>`
- MCP tools 注册
- 工具输入输出 schema

验收：

- MCP client 能调用 `repo_map`
- MCP client 能调用 `find_related_files`
- MCP client 能调用 `prepare_task_context`

### Milestone 7：项目记忆

交付：

- `remember_task`
- `search_project_memory`
- capsule 中显示 memory hits

验收：

```bash
pnav capsule tests/fixtures/tiny-repo "workspace microplan 滚动"
```

如果已有相关 memory，输出要显示。

### Milestone 8：真实项目验收

交付：

对 `flutter-transfer` 跑真实场景：

```bash
pnav init /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
pnav scan /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
pnav capsule /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "修复 workspace microplan 页面滚动问题"
pnav capsule /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "修改登录身份切换逻辑"
pnav capsule /Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer "调整 session plan 接口字段"
```

验收标准以 `examples/flutter-transfer/demo-queries.md` 为准。

## 13. 最小 fixture repo

为了测试，不要一开始只依赖真实大项目。

创建：

```text
tests/fixtures/tiny-repo/
  AGENTS.md
  Makefile
  frontend/lib/core/router/app_router.dart
  frontend/lib/modules/workspace/pages/microplan_page.dart
  frontend/test/integration/workspace_microplan_scroll_test.dart
  backend/app/api/v1/session_plans.py
  backend/app/services/session_plan_service.py
  backend/app/schemas/session_plan.py
```

这样可以稳定测试 scanner、graph、capsule。

## 14. 开发顺序建议

最现实的开发顺序：

```text
1. CLI skeleton
2. SQLite migration
3. pnav init
4. file scanner
5. command/rule scanner
6. pnav scan
7. pnav map
8. simple symbol scanner
9. simple graph query
10. pnav capsule
11. MCP server
12. memory tools
13. real flutter-transfer demo
14. Tree-sitter enhancement
```

不要一开始就做 Tree-sitter 深度集成。先让 Codex / Claude Code 能通过 MCP 查到项目地图。

## 15. 当前最重要的产品判断

这个项目的核心壁垒不是“我也能解析 AST”，而是：

```text
代码索引
+ 任务相关上下文生成
+ 改动影响分析
+ 测试推荐
+ 项目记忆
+ MCP 接入 Codex / Claude Code
```

所以第一版最应该打磨的是 `prepare_task_context` / `pnav capsule`。

它应该让用户明显感受到：

> AI 不再盲目读全仓库，而是先拿到一份高质量任务交接文档。

## 16. 给 Codex / Claude Code 的首个开发任务提示词

可以把下面这段直接丢给 coding agent：

```text
请阅读 README.md、DEVELOPMENT.zh-CN.md、AGENTS.md、docs/architecture.md、docs/mcp-tools.md。

目标：实现 ProjectNavigatorMCP 的 TypeScript MVP 骨架。

第一阶段只实现：
1. package.json / tsconfig / vitest 配置
2. pnav doctor
3. pnav init <repo>
4. SQLite schema 和 migrations
5. tests/fixtures/tiny-repo
6. 对 init 和 migration 的测试

限制：
- 不要引入 Postgres
- 不要实现 Web UI
- 不要硬编码 flutter-transfer 路径
- 不要先做 Tree-sitter
- 保持模块结构和 DEVELOPMENT.zh-CN.md 一致
```

第二个任务再让它做 scanner：

```text
继续实现 pnav scan 和 pnav map。

要求：
- 扫描文件列表
- 识别语言
- 忽略 .git、node_modules、build、dist、.pnav 等目录
- 解析 Makefile 命令
- 解析 AGENTS.md 规则
- 写入 files、commands、project_rules
- pnav map 输出 repo summary
- 添加测试
```

第三个任务再做 MCP：

```text
继续实现 pnav mcp <repo>。

要求：
- 使用 @modelcontextprotocol/sdk
- 暴露 repo_map、find_related_files、prepare_task_context 三个工具
- 先复用已有 graph/capsule 服务
- 添加工具输出 shape 测试
```

## 17. 常见错误

### 错误 1：一开始就上 Postgres

不建议。MVP 本地使用 SQLite 就够了。

### 错误 2：一开始就追求完美调用链

不建议。先用路径、symbol、命令、测试、Git co-change 做高性价比定位。

### 错误 3：把示例项目路径写死

不允许。示例路径只能出现在 docs/examples 里，不能出现在业务逻辑里。

### 错误 4：只做 codegraph，不做 capsule

这是最大风险。用户真正要的是 AI 开工前的任务上下文包，不是一个只能查询关系的数据库。

### 错误 5：记忆没有可信度

memory 必须包含来源、相关文件、相关命令和时间。不要把未经验证的猜测写成项目记忆。

### v0.8.2 Production Gate 回归保护

Discovery Mode 的生产级输出以 `authoritativeHandoff` 为准：

- `mustRead` 仍然最多 5 个主文件。
- `supportingContext` 和 `suppressedCandidates` 要给出精确 suppression reason。
- `route_test_covered` 只能在 route/page/widget 链路存在相关测试时输出。
- `reuseDecision.affectedCallers` 应从 symbol graph 返回调用方文件。
- production eval 可以断言 `suppressedWithReasons`、`maxMustRead` 和 `minChainCompleteness`。

v0.8.3 进一步要求：

- strict eval 不能只看平均分，必须用 `hardFailures` 拦住 forbidden mustRead、预算超限、suppression reason 缺失、链路完整度不足。
- `route_test_covered` 只能由 direct/naming test relationship 触发；related search 只能算 weak coverage。
- design-system/token/guard/breakpoint/DS-\* 任务中，theme/token/breakpoint 文件不得默认被压成普通 support。

v0.8.4 进一步要求：

- workflow profile 优先从目标仓库读取：`.agents/pnav/workflow-profiles.json`，其次 `.pnav/workflow-profiles.json`，最后才用内置 fallback。
- profile 中只有已存在文件可以进入 `mustRead` / `supportingContext`；未来文件、证据目录、migration pair、反例记录应放入 `newFileExpectations`。
- `authoritativeHandoff.workflowProtocol` 必须暴露 `profiles`、`actions`、`recommendedCommands`、`newFileExpectations`、`editPolicies`、`gateSteps`。
- strict eval 可以断言 workflow protocol，不改变旧 production score，但缺失 action、command、read-only policy、gate step 或 repo-local source 时必须 hard fail。
- repo-local `mustRead` seed 支持 `mustReadPolicy: "force" | "normal"`；字符串 seed 默认 force，只绕过 generic noise，不绕过 mustRead 预算。
- `trace-feature` 命中 workflow profile 时必须输出 `mode: "workflow"` 和 `workflowChain`，不要为 OpenAPI、DB、guard、visual matrix 任务伪造 route/page chain。
- 当 workflow commands 存在时，generic related-test commands 只能作为 `fallbackCommands`。
- incremental scan 必须区分 workflow profile、eval suite、command source、docs 和 code graph 变化，只有 code graph 变化才 conservative full rebuild。

v0.8.5 进一步要求：

- incremental scan 必须输出 `changePlanes`、`actions`、`codeGraphStale` 和 `partialGraphUpdate`，不能把 mixed dirty worktree 简化成单一 `code_graph`。
- `--metadata-only` 只能刷新 workflow/eval/command/doc metadata；源码变化必须标记 stale，不能偷偷更新文件 hash 后掩盖 stale graph。
- 少量源码变化默认走 file-level graph update v1；超过阈值或删除源码文件时才 conservative full rebuild。
- eval suite 应复用 runtime context，并输出 `indexStatus` 与 `cacheStats`，便于定位 suite 级性能瓶颈。

v0.8.6 进一步要求：

- metadata-only eval 必须输出 `evalValidity.scoreScope: "metadata_only"`，并说明只适合 workflow/profile/protocol 验证；不能把 stale code graph 的分数当成 full graph 可信度。
- strict eval 支持 `requiresFreshCodeGraph`；当 code graph stale 时必须 hard fail：`fresh_code_graph_required_but_stale`。
- incremental scan 使用 partial graph invalidation v2；`<=20` 个 code graph path 走 normal partial，`21-100` 走 batch partial，`>100` 才 conservative full rebuild。
- 删除源码文件必须走 invalidate path：标记 `files.deleted_at`，清理 outgoing graph rows，移除 stale incoming references，并把 importers/callers 纳入 affected expansion。
- partial scan 必须输出 graph-plane `freshness`；`coChangeGraph` 可以是 `stale_until_full_scan`，但不能把 stale co-change 当作唯一 critical evidence。
- eval runtime cacheStats 不能只有 `entrypointCatalog`，还要暴露 file/symbol/route/workflow/relatedFiles/handoff/relatedTests 等 bucket。

## 18. 完成 MVP 的定义

当以下流程能跑通时，可以认为 MVP 完成：

```bash
pnav init tests/fixtures/tiny-repo
pnav scan tests/fixtures/tiny-repo
pnav map tests/fixtures/tiny-repo
pnav capsule tests/fixtures/tiny-repo "修复 workspace microplan 页面滚动问题"
pnav mcp tests/fixtures/tiny-repo
```

并且 MCP client 能调用：

```text
repo_map
find_related_files
prepare_task_context
remember_task
search_project_memory
```

真实项目验收再使用：

```text
/Users/vsiyo/Desktop/Athlete_Platform/flutter-transfer
```

如果 `flutter-transfer` 的三个 demo queries 能返回预期文件、命令、规则和风险提示，就可以进入下一阶段：Tree-sitter、LSP、SCIP 或 Postgres。
