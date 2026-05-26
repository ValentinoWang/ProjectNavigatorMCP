# Minimal Repair Path

`minimalRepairPath` is the v0.4 field new agents should read first.

It is intentionally shorter than `executionPlan` and answers:

```text
What is the shortest safe path to repair this guarded task?
```

## Rules

- Keep the path to 4-7 steps.
- Start with the direct guard failure location when available.
- Include the canonical design-system/token source when a guard recipe provides one.
- Include one edit step for the must-edit file.
- Include primary and secondary validation commands when known.
- Exclude screenshots, QA manifests, Maestro, Patrol, and broad exploratory steps unless the task explicitly asks for them.

## Relationship To Other Fields

- `minimalRepairPath` is the preferred execution path.
- `executionPlan` remains useful for diagnostics and broader planning.
- `editBoundaryV2` defines whether a step target is editable, inspect-only, reference-only, or forbidden.
