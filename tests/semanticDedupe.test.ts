import { describe, expect, it } from "vitest";
import type { ExecutionPlanItem } from "../src/capsule/prepareTaskContext.js";
import { semanticDedupePlanItems } from "../src/planner/semanticDedupe.js";

describe("semanticDedupePlanItems", () => {
  it("merges equivalent guard commands and preserves evidence in why", () => {
    const plan: ExecutionPlanItem[] = [
      {
        order: 1,
        phase: "validation",
        title: "Run role guard",
        command: "python scripts/quality/check_role_visual_system_guard.py",
        targetPath: null,
        category: "guard",
        why: "Primary failing guard."
      },
      {
        order: 2,
        phase: "validation",
        title: "Run source validation",
        command: "python3 scripts/quality/check_role_visual_system_guard.py",
        targetPath: null,
        category: "guard",
        why: "Also listed in source_doc validation."
      }
    ];

    const result = semanticDedupePlanItems(plan);

    expect(result.items).toHaveLength(1);
    expect(result.deduped).toHaveLength(1);
    expect(result.items[0]?.why).toContain("Primary failing guard.");
    expect(result.items[0]?.why).toContain("Also listed in source_doc validation.");
  });
});
