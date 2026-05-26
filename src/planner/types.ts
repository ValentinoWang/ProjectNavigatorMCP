import type { ExecutionPlanItem, ReadOrderItem } from "../capsule/prepareTaskContext.js";

export interface DomainDecision {
  name: string;
  confidence: number;
  evidence: string[];
}

export interface DomainGateDebug {
  demotedFiles: Array<{
    path: string;
    fromScore: number;
    toScore: number;
    reason: string;
  }>;
  droppedCommands: Array<{
    command: string;
    reason: string;
    score: number;
  }>;
}

export interface RankedExecutionStep extends ExecutionPlanItem {
  score: number;
  keep: boolean;
  penalties: string[];
}

export interface PlannerDebug extends DomainGateDebug {
  domainDecision: DomainDecision | null;
}

export interface DomainGateInput {
  task: string;
  domainHint?: string;
  explicitPaths: string[];
  readOrder: ReadOrderItem[];
}
