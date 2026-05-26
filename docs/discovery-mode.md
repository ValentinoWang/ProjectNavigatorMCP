# Discovery Mode

Discovery Mode is for ordinary feature work and code understanding tasks.

Use it when the user asks:

- where a feature starts
- which files are relevant
- which component/service already exists
- who calls a symbol
- what might be impacted
- why a file is related

Use Repair Mode when the task has guard output, source documents, changed files, or a failing `file:line`.

## Tools

- `discover_code`
- `find_entrypoints`
- `find_callers`
- `find_callees`
- `trace_symbol`
- `find_similar_code`
- `find_reusable_components`
- `module_map`
- `why_related`
- `impact_analysis_v2`

`prepare_task_context` accepts `mode: "auto" | "discovery" | "repair"`.
