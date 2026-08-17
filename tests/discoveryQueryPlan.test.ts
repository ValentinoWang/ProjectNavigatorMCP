import { describe, expect, it } from "vitest";
import { planDiscoveryQuery } from "../src/discovery/queryPlan.js";

describe("discovery query plan", () => {
  it("keeps UI work on the route-to-widget chain", () => {
    const plan = planDiscoveryQuery("新增 dashboard trend card");
    expect(plan.mode).toBe("route_ui");
    expect(plan.runRouteChain).toBe(true);
    expect(plan.runWhyRelated).toBe(true);
  });

  it("skips broad discovery work for known workflows", () => {
    const plan = planDiscoveryQuery("dashboard workflow", true);
    expect(plan.mode).toBe("workflow_known");
    expect(plan.runRouteChain).toBe(false);
    expect(plan.runReuse).toBe(false);
    expect(plan.runWhyRelated).toBe(false);
  });

  it("selects symbol and call graph work for impact requests", () => {
    const plan = planDiscoveryQuery("impact of changing add callers");
    expect(plan.mode).toBe("symbol_change");
    expect(plan.runSymbols).toBe(true);
    expect(plan.runCallGraph).toBe(true);
    expect(plan.runRouteChain).toBe(false);
  });
});
