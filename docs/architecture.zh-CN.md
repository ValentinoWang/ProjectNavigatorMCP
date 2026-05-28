# 架构

## 架构总览

```mermaid
flowchart TB
  User["使用者\nCodex / Claude Code / 人类开发者"]

  subgraph Entry["1. 入口层"]
    CLI["pnav CLI\nscan / discover / eval"]
    MCP["pnav MCP server\ndiscover_code / production_discovery_eval"]
  end

  subgraph Repo["2. 目标仓库输入"]
    Source["源码、测试、文档、脚本"]
    Rules["仓库规则\nAGENTS / CLAUDE / README / docs / skills"]
    Profiles["workflow profiles\n.agents/pnav -> .pnav -> built-in fallback"]
  end

  subgraph Index["3. 扫描与本地索引"]
    Scanner["扫描器\nfile / rule / command / symbol / git"]
    SQLite["本地索引\n.pnav/project.sqlite"]
  end

  subgraph Discovery["4. Discovery 生产导航"]
    Candidates["候选生成\n入口、相关文件、符号、复用、测试"]
    Ranking["确定性排序 + 噪声压制\n优先 profile、规则、路径、符号、命令证据"]
    Gate["Strict MustRead Gate\n最多 5 个 mustRead\n其余进入 supporting 或 suppressed"]
  end

  subgraph Bundle["5. Strict Handoff Bundle"]
    Handoff["authoritativeHandoff\nmustRead / supportingContext / suppressedCandidates"]
    Protocol["workflowProtocol\nactions / commands / new files / edit policies / gate steps"]
    BundleOut["统一交付包\nstrict handoff + workflow protocol"]
  end

  subgraph Output["6. 消费与验收"]
    Agent["AI agent 开工\n先读 mustRead，再按 workflowProtocol 执行"]
    ClientOutput["CLI / MCP 输出\npnav discover / discover_code"]
    Eval["strict production eval\n断言读序、warnings、actions、commands、new files、read-only、gate steps、profile source"]
    Docs["同步文档与示例\noutput contract / MCP docs / production eval / README / development plan / suite"]
  end

  User --> CLI
  User --> MCP
  CLI --> Source
  MCP --> SQLite
  Source --> Scanner
  Rules --> Scanner
  Scanner --> SQLite
  SQLite --> Candidates
  Profiles --> Ranking
  Candidates --> Ranking
  Ranking --> Gate
  Gate --> Handoff
  Profiles --> Protocol
  Handoff --> BundleOut
  Protocol --> BundleOut
  BundleOut --> Agent
  BundleOut --> ClientOutput
  BundleOut --> Eval
  BundleOut --> Docs
```

## 图中概念说明

这张图表达的是 ProjectNavigatorMCP 从“读取目标仓库”到“交给 AI agent 可执行上下文”的
完整链路。它不是一个普通代码搜索工具，而是把仓库索引、仓库规则、workflow profile 和
strict eval 串成一个可验证的导航协议。

### 1. 入口层

入口层有两种使用方式：

- `pnav CLI`：给人类、脚本和 CI 使用，例如 `pnav scan`、`pnav discover`、`pnav eval`。
- `pnav MCP server`：给 Codex、Claude Code 等 MCP client 使用，例如 `discover_code` 和
  `production_discovery_eval`。

两者共享同一套底层索引和 discovery 逻辑。CLI 不是另一套实现，MCP 也不会绕过本地索引。

### 2. 目标仓库输入

目标仓库提供三类输入：

- `源码、测试、文档、脚本`：这是扫描器建立代码地图的基础。
- `仓库规则`：包括 `AGENTS.md`、`CLAUDE.md`、`README`、`docs`、`skills` 等，用来告诉
  pnav 这个仓库自己的工程约束。
- `workflow profiles`：这是本次新增的生产导航协议来源，读取顺序是
  `.agents/pnav/workflow-profiles.json`、`.pnav/workflow-profiles.json`、built-in fallback。

这里的关键点是：优先让目标仓库自描述，而不是把项目知识长期写死在 ProjectNavigatorMCP
内部。

### 3. 扫描与本地索引

扫描器把目标仓库转换成本地可查询的 SQLite 索引：

- `file`：文件路径、语言、忽略规则。
- `rule`：仓库规则和文档约束。
- `command`：Makefile、package、pubspec、pyproject 等声明的命令。
- `symbol`：函数、类、import、引用线索。
- `git`：当前 sha 和 co-change 线索。

索引写入目标仓库自己的 `.pnav/project.sqlite`。它不使用目标项目的业务数据库，也不需要
Postgres 或远端服务。

### 4. Discovery 生产导航

Discovery 层负责把自然语言任务转换成可读、可执行的上下文：

- `候选生成`：找入口、相关文件、符号、复用候选和测试。
- `确定性排序 + 噪声压制`：用路径、规则、命令、符号、profile 等证据排序，并压制 l10n、
  logger、截图、E2E、无关业务入口、生成物等噪声。
- `Strict MustRead Gate`：最多只允许 5 个强证据核心文件进入 `mustRead`；证据不足但仍有用的
  进入 `supportingContext`；不该驱动任务的进入 `suppressedCandidates`。

这一层解决的问题是：AI 不应该从一大堆“看起来相关”的文件里猜入口，而应该先拿到短小、
严格、可解释的主路径。

### 5. Strict Handoff Bundle

`Strict Handoff Bundle` 是交给 AI agent 的核心产物，由两部分组成：

- `authoritativeHandoff`：回答“先读哪里”。它包含 `mustRead`、`supportingContext` 和
  `suppressedCandidates`。
- `workflowProtocol`：回答“接下来怎么施工”。它包含 `actions`、`recommendedCommands`、
  `newFileExpectations`、`editPolicies` 和 `gateSteps`。

二者分工不同：`mustRead` 解决上下文选择，`workflowProtocol` 解决工程动作。比如 OpenAPI
任务不只要命中 OpenAPI 文件，还要标记 generated SDK 为 `read_only`，并推荐 `sdk:generate`
和 `sdk:check`。

### 6. 消费与验收

统一交付包有四个消费方向：

- `AI agent 开工`：按 `mustRead` 阅读主路径，再按 `workflowProtocol` 执行动作、命令和门禁。
- `CLI / MCP 输出`：通过 `pnav discover` 或 `discover_code` 返回给调用方。
- `strict production eval`：断言不仅包括 `mustRead`，还包括读序、warning、action、command、
  new file、read-only policy、gate step 和 profile source。
- `同步文档与示例`：输出契约、MCP docs、production eval docs、README、开发计划和示例 suite
  必须跟 schema 一起更新。

所以这张图的核心不是“代码搜索流程”，而是：

```text
仓库自描述规则
-> 确定性 discovery
-> strict handoff
-> 结构化 workflow protocol
-> strict eval 验收
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
