export type DiscoveryQueryMode = "direct_repair" | "workflow_known" | "route_ui" | "symbol_change" | "broad_discovery";

export interface DiscoveryQueryPlan {
  mode: DiscoveryQueryMode;
  runRelatedFiles: boolean;
  runSymbols: boolean;
  runRouteChain: boolean;
  runReuse: boolean;
  runCallGraph: boolean;
  runWhyRelated: boolean;
  runTests: boolean;
}

const UI_TERMS = /\b(route|router|page|screen|widget|navigation|flutter|ui|layout|dashboard|card|view)\b/i;
const SYMBOL_TERMS = /\b(symbol|caller|callee|callers|callees|impact|affected|change|改|影响|调用)\b/i;

export function planDiscoveryQuery(task: string, workflowKnown = false): DiscoveryQueryPlan {
  if (workflowKnown) {
    return {
      mode: "workflow_known",
      runRelatedFiles: true,
      runSymbols: false,
      runRouteChain: false,
      runReuse: false,
      runCallGraph: false,
      runWhyRelated: false,
      runTests: true
    };
  }
  if (UI_TERMS.test(task)) {
    return {
      mode: "route_ui",
      runRelatedFiles: true,
      runSymbols: true,
      runRouteChain: true,
      runReuse: true,
      runCallGraph: true,
      runWhyRelated: true,
      runTests: true
    };
  }
  if (SYMBOL_TERMS.test(task)) {
    return {
      mode: "symbol_change",
      runRelatedFiles: true,
      runSymbols: true,
      runRouteChain: false,
      runReuse: true,
      runCallGraph: true,
      runWhyRelated: true,
      runTests: true
    };
  }
  return {
    mode: "broad_discovery",
    runRelatedFiles: true,
    runSymbols: true,
    runRouteChain: false,
    runReuse: true,
    runCallGraph: true,
    runWhyRelated: true,
    runTests: true
  };
}
