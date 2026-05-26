# 文档修改指南

这份文档说明 ProjectNavigatorMCP 现在应该怎么整理文档，以及每份文档负责什么。

## 总体判断

当前仓库里的文档方向是正确的：它已经明确了本项目不是业务数据库、不是替代 Codex / Claude Code，而是一个项目代码地图和项目记忆 MCP。

但当前文档还有三个问题：

1. 文档偏“想法说明”，缺少开发者可以逐步执行的实现说明。
2. `development-plan.md` 和 `mcp-tools.md` 的工具列表不完全一致。
3. 示例项目路径写得较多，容易让实现者误以为只能服务 `flutter-transfer`。

## 建议保留的文档

### `README.md`

定位：项目入口文档。

应该写清楚：

- 这个项目一句话是什么。
- 它是什么、不是什么。
- SQLite 是代码分析数据库，不是业务数据库。
- MVP 有哪些 CLI 命令。
- MVP 有哪些 MCP tools。
- 从哪份开发文档开始看。

不要在 README 里写太多实现细节，避免以后难维护。

### `DEVELOPMENT.zh-CN.md`

定位：主开发文档。

这是开发者和 AI coding agent 最该读的文档。它应该回答：

- 为什么做这个项目。
- 第一版到底要做什么。
- 用什么技术栈。
- 数据库表怎么设计。
- 每个模块怎么拆。
- 每个里程碑交付什么。
- 怎么验收。

这份文档应该比 `development-plan.md` 更具体。

### `AGENTS.md`

定位：写给 Codex / Claude Code 的开发规则。

它应该告诉 AI：

- 不要上来引入 Postgres。
- 不要硬编码示例路径。
- 先打通 init / scan / query / mcp / capsule / memory 闭环。
- 变更 CLI、schema、tools 时要同步改哪些文档。

### `docs/architecture.md`

定位：架构说明。

应该写：

- CLI、scanner、SQLite、graph query、MCP server、capsule、memory 之间的关系。
- 为什么 MVP 用 SQLite。
- 未来什么时候引入 Postgres、LSP、SCIP、Tree-sitter 深度解析。

不要把架构文档写成任务清单。

### `docs/development-plan.md`

定位：阶段计划。

应该写每个 milestone 的任务、交付物、验收条件。

它应该比主开发文档短，适合当项目管理清单。

### `docs/mcp-tools.md`

定位：MCP 工具接口文档。

应该写清楚每个 tool 的：

- 名称
- 用途
- 输入 JSON
- 输出 JSON
- 注意事项

这里需要和 README、development-plan 中的工具列表保持一致。

### `examples/flutter-transfer/demo-queries.md`

定位：真实项目验收用例。

这份文档可以继续保留硬编码路径，因为它就是示例。

但需要注意：实现代码不能硬编码这个路径，只能通过 CLI 参数传入。

## 建议新增或已经新增的文档

### `docs/documentation-change-guide.zh-CN.md`

定位：文档维护说明，也就是当前文件。

它告诉开发者改哪份文档，以及改文档时要避免什么。

## 不建议现在新增的文档

暂时不建议新增太多文档，比如：

- `docs/lsp.md`
- `docs/postgres.md`
- `docs/vector-db.md`
- `docs/scip.md`
- `docs/embedding.md`

这些属于后续增强。现在先把 MVP 闭环做出来。

## 文档同步规则

只要改了 CLI 命令，就同步修改：

- `README.md`
- `DEVELOPMENT.zh-CN.md`
- `docs/development-plan.md`

只要改了 MCP tool，就同步修改：

- `README.md`
- `DEVELOPMENT.zh-CN.md`
- `docs/mcp-tools.md`

只要改了数据库 schema，就同步修改：

- `DEVELOPMENT.zh-CN.md`
- `docs/architecture.md`
- 源码里的 migration 文件

只要改了示例项目验收方式，就同步修改：

- `examples/flutter-transfer/demo-queries.md`
- `docs/development-plan.md`

## 当前最重要的文档调整结论

当前最需要做的是：

1. 把 `README.md` 改成更清楚的项目入口。
2. 新增 `DEVELOPMENT.zh-CN.md` 作为中文主开发文档。
3. 新增 `AGENTS.md` 让 Codex / Claude Code 知道怎么开发本项目。
4. 把 `docs/mcp-tools.md` 的工具列表统一成 MVP 工具列表。
5. 把 `docs/development-plan.md` 从概念描述改成带验收标准的阶段计划。
6. 保留 `examples/flutter-transfer/demo-queries.md` 作为真实验收样例。
