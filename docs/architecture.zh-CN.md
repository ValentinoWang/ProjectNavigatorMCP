# 架构

## 架构总览

```mermaid
flowchart TB
  User["使用者\nCodex / Claude Code / 人类开发者"]

  subgraph Entry["入口层"]
    CLI["pnav CLI\npnav doctor / init / scan / map / capsule / discover / eval"]
    MCP["pnav MCP server\nrepo_map / discover_code / production_discovery_eval"]
  end

  subgraph TargetRepo["目标 Git 仓库"]
    Source["源码、测试、文档、脚本"]
    Rules["仓库规则\nAGENTS.md / CLAUDE.md / README / docs / skills"]
    RepoProfile["持久 workflow profile\n.agents/pnav/workflow-profiles.json"]
    LocalProfile["本地 override profile\n.pnav/workflow-profiles.json"]
    SQLite["ProjectNavigator 本地索引\n.pnav/project.sqlite"]
  end

  subgraph Scanner["扫描与索引层"]
    FileScan["文件扫描\n路径、语言、忽略规则"]
    RuleScan["规则扫描\nAGENTS / CLAUDE / README / docs"]
    CommandScan["命令扫描\nMakefile / package / pubspec / pyproject"]
    SymbolScan["符号扫描\n函数、类、import、引用线索"]
    GitScan["Git 扫描\n当前 sha、co-change"]
  end

  subgraph Discovery["Discovery 生产导航层"]
    Related["基础候选\n相关文件、入口、符号、复用候选、测试"]
    ProfileResolver["workflow profile 解析\n1. .agents/pnav\n2. .pnav\n3. built-in fallback"]
    Ranker["确定性排序\n路径、规则、命令、符号、复用、profile 权重"]
    Suppression["噪声压制\nl10n、logger、截图、E2E、生成物、无关业务入口"]
    StrictGate["Strict MustRead Gate\n最多 5 个 mustRead\n证据不足进入 supporting/suppressed"]
  end

  subgraph Handoff["结构化交接层"]
    MustRead["authoritativeHandoff.mustRead\nAI 必须先读的主路径"]
    Supporting["supportingContext\n辅助上下文、guard、docs、tests"]
    Suppressed["suppressedCandidates\n被压制文件及原因"]
    Protocol["workflowProtocol\nprofiles / actions / recommendedCommands\nnewFileExpectations / editPolicies / gateSteps"]
  end

  subgraph Consumers["消费与验收层"]
    Agent["AI agent 开工\n按 mustRead + workflowProtocol 执行"]
    CLIOutput["CLI 输出\npnav discover / pnav eval"]
    MCPOutput["MCP 输出\ndiscover_code.data.authoritativeHandoff"]
    StrictEval["strict production eval\n断言 mustRead、supporting、read order、warnings、actions、commands、new files、read-only、gate steps、profile source"]
    Docs["同步文档与示例\noutput contract / MCP docs / production eval / README / development plan / example suite"]
  end

  User --> CLI
  User --> MCP
  CLI --> Source
  MCP --> SQLite

  Source --> FileScan
  Source --> SymbolScan
  Source --> GitScan
  Rules --> RuleScan
  Source --> CommandScan

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
  Ranker --> Suppression
  Suppression --> StrictGate

  StrictGate --> MustRead
  StrictGate --> Supporting
  StrictGate --> Suppressed
  ProfileResolver --> Protocol

  MustRead --> Agent
  Supporting --> Agent
  Suppressed --> Agent
  Protocol --> Agent
  MustRead --> CLIOutput
  Protocol --> CLIOutput
  MustRead --> MCPOutput
  Protocol --> MCPOutput
  MustRead --> StrictEval
  Supporting --> StrictEval
  Suppressed --> StrictEval
  Protocol --> StrictEval
  Protocol --> Docs
```

ProjectNavigatorMCP 的目标是成为本地优先的 Repository Intelligence MCP。它扫描目标 Git
仓库，把项目索引写入目标仓库自己的 `.pnav/project.sqlite`，然后通过 CLI 和 MCP 工具给
Codex、Claude Code 或人类开发者提供任务导航、影响分析、测试推荐和项目记忆。

目标仓库的业务数据库不会被 ProjectNavigatorMCP 使用。所有代码地图、索引和评测记录都
属于 ProjectNavigatorMCP 自己的本地数据：

```text
<target-repo>/.pnav/project.sqlite
```

## Workflow Protocol

`discover_code.data.authoritativeHandoff` 是生产级 Discovery Mode 的主输出。AI agent
应该先看 `authoritativeHandoff.mustRead`，再根据 `workflowProtocol` 决定本轮要执行
哪些动作、命令、证据产物和门禁。

workflow profile 的读取顺序是：

1. `.agents/pnav/workflow-profiles.json`
2. `.pnav/workflow-profiles.json`
3. 内置 fallback profile

其中 `.agents/pnav` 是推荐的持久配置位置，`.pnav` 只适合本地 override。内置 profile
用于目标仓库尚未配置 profile 时避免能力倒退。

profile 可以描述：

- `match`：任务匹配规则。
- `mustRead`：必须先读的核心文件，只允许已经存在的文件进入。
- `supporting`：辅助上下文，只允许已经存在的文件进入。
- `suppressPaths`：需要压制的噪声路径。
- `warnings`：必须提示给 agent 的工作流约束。
- `actions`：结构化施工动作，例如 `create_openapi_operation`、`create_migration_pair`。
- `recommendedCommands`：推荐或必跑命令，例如 `sdk:generate`、`sdk:check`。
- `newFileExpectations`：未来文件、证据目录、migration pair、临时反例记录。
- `editPolicies`：编辑策略，例如 generated SDK 标记为 `read_only`。
- `gateSteps`：验收步骤，例如 guard、schema drift、Appium acceptance。

关键约束：

- `mustRead` 和 `supportingContext` 只接收目标仓库中已经存在的文件。
- 未来文件、证据目录、migration pair、临时反例记录放入 `newFileExpectations`。
- generated SDK 等生成物通过 `editPolicies` 标记为 `read_only`，由推荐命令生成。
- strict eval 不只检查平均分，也检查读文件顺序、warning、action、command、new file、
  read-only policy、gate step 和 profile source。

## 运行模式

### CLI 模式

CLI 面向人类、脚本和验收测试：

```bash
pnav doctor
pnav init <repo>
pnav scan <repo>
pnav map <repo>
pnav capsule <repo> "<task>"
pnav mcp <repo>
```

### MCP 模式

MCP 面向 Codex、Claude Code 或其他 MCP client：

```bash
pnav mcp <repo>
```

MCP server 会打开：

```text
<repo>/.pnav/project.sqlite
```

并暴露 repository intelligence 工具。MCP 工具调用不会默认重新扫描整个仓库；扫描应由
`pnav scan <repo>` 或未来显式的 refresh 工具触发。

## 存储模型

MVP 使用 SQLite。

SQLite 存储：

- 仓库元数据
- 扫描记录
- 文件
- 符号
- 图边
- 命令
- 项目规则
- 记忆
- 任务

选择 SQLite 是因为它本地优先、可移植、可检查、不需要守护进程。Postgres 只作为未来选项，
例如团队共享记忆、Web dashboard、多项目分析、权限审计或 SaaS 部署。

## 图模型

核心图模型使用通用 `edges` 表：

```text
from node -> edge kind -> to node
```

初始节点类型：

- `file`
- `symbol`
- `command`
- `rule`
- `memory`
- `task`

初始边类型：

- `contains`：文件包含符号。
- `imports`：文件 import 另一个文件。
- `references`：文件或符号引用另一个符号。
- `routes_to`：路由映射到页面或 handler。
- `covered_by`：源文件可能被测试文件覆盖。
- `co_changes`：Git 历史中经常一起变更的文件。
- `mentions`：文档、规则或记忆提到文件、符号或命令。

MVP 可以延后精确 `calls` 边。可靠的局部图比脆弱的完整 call graph 更重要。

## 查询策略

主产品行为不使用普通 BFS，而是使用加权检索：

```text
score = path match + symbol match + rule match + command match + test relation + git co-change + memory match
```

第一版保持确定性和可解释。后续可以增加 Tree-sitter、LSP、SCIP、embeddings 或运行时 trace。

## Context Capsule

context capsule 是面向 coding agent 的任务上下文包。

它应该包含：

- 任务解释
- 可能相关文件
- 入口点
- 相关符号
- 影响风险
- 推荐测试和命令
- 项目规则
- 记忆命中
- 建议下一步

生产级 Discovery Mode 中，context capsule 应优先使用 `authoritativeHandoff`。它提供严格
的 `mustRead`、route-to-widget 链路完整度、精确 suppression reason、复用影响调用方和
测试覆盖证据。strict eval 应把 forbidden mustRead、suppression reason 缺失、mustRead
超预算、链路完整度不足、workflow action 缺失等作为 hard failure。
