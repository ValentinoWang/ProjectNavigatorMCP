import type { ContextProfile } from "./contextProfile.js";
import type { TaskContext } from "./prepareTaskContext.js";

export interface ContextReceiptReadItem {
  path: string;
  line?: number;
  reason: string;
}

export interface ContextReceipt {
  contextId: string;
  profile: ContextProfile;
  state: {
    fresh: boolean;
    mode: TaskContext["mode"];
    confidence: "high" | "medium" | "low";
  };
  read: ContextReceiptReadItem[];
  edit: {
    must: string[];
    may: string[];
    blocked: string[];
  };
  validate: string[];
  warnings: string[];
  expandable: string[];
}

export function buildContextReceipt(context: TaskContext): ContextReceipt {
  const budget = context.profile === "brief" ? { primary: 3, supporting: 2, commands: 3, warnings: 3 } : null;
  const seen = new Set<string>();
  const read: ContextReceiptReadItem[] = [];
  const addRead = (item: { path: string; line?: number | null; why: string }) => {
    if (seen.has(item.path)) return;
    seen.add(item.path);
    read.push({ path: item.path, ...(item.line ? { line: item.line } : {}), reason: item.why });
  };

  const primary = context.coreReadOrder.length > 0 ? context.coreReadOrder : context.readOrder;
  for (const item of primary.slice(0, budget?.primary ?? primary.length)) addRead(item);
  const supporting = context.referenceReadOrder.length > 0 ? context.referenceReadOrder : context.readOrder;
  for (const item of supporting.slice(0, budget?.supporting ?? supporting.length)) addRead(item);

  const warnings = Array.from(new Set([...context.editBoundaryV2.warnings, ...context.warnings])).slice(
    0,
    budget?.warnings ?? context.warnings.length
  );
  const validate = context.recommendedCommands
    .map((command) => command.command)
    .concat(context.worktreeBoundary.verifyDiffCommands)
    .filter((command, index, all) => all.indexOf(command) === index)
    .slice(0, budget?.commands ?? context.recommendedCommands.length);

  const confidence = receiptConfidence(context);
  const receipt: ContextReceipt = {
    contextId: context.taskSessionId,
    profile: context.profile,
    state: {
      fresh: !context.dirtyWorktree || context.dirtyWorktree.warnings.length === 0,
      mode: context.mode,
      confidence
    },
    read,
    edit: {
      must: context.editBoundaryV2.mustEditFiles.slice(
        0,
        budget?.primary ?? context.editBoundaryV2.mustEditFiles.length
      ),
      may: context.editBoundaryV2.mayEditFiles.slice(
        0,
        budget?.supporting ?? context.editBoundaryV2.mayEditFiles.length
      ),
      blocked: context.editBoundaryV2.doNotTouchFiles.slice(0, 20)
    },
    validate,
    warnings,
    expandable: ["standard", "debug", "impact", "evidence", "reuse"]
  };
  return compactBriefReceipt(receipt);
}

function compactBriefReceipt(receipt: ContextReceipt): ContextReceipt {
  if (receipt.profile !== "brief") return receipt;
  const compact = {
    ...receipt,
    read: receipt.read.map((item) => ({ ...item, reason: item.reason.slice(0, 180) })),
    warnings: receipt.warnings.map((warning) => warning.slice(0, 180)),
    edit: {
      must: receipt.edit.must.slice(0, 3),
      may: receipt.edit.may.slice(0, 2),
      blocked: receipt.edit.blocked.slice(0, 8)
    }
  };
  while (JSON.stringify(compact).length > 2500 && compact.warnings.length > 0) compact.warnings.pop();
  while (JSON.stringify(compact).length > 2500 && compact.read.length > 3) compact.read.pop();
  while (JSON.stringify(compact).length > 2500 && compact.edit.blocked.length > 0) compact.edit.blocked.pop();
  while (JSON.stringify(compact).length > 2500 && compact.read.some((item) => item.reason.length > 80)) {
    const item = compact.read.find((candidate) => candidate.reason.length > 80);
    if (item) item.reason = item.reason.slice(0, 77).trimEnd() + "...";
  }
  while (JSON.stringify(compact).length > 2500 && compact.validate.length > 1) compact.validate.pop();
  return compact;
}

function receiptConfidence(context: TaskContext): "high" | "medium" | "low" {
  if (context.warnings.length > 0 || context.editBoundaryV2.mustEditFiles.length === 0) return "medium";
  if (context.discovery?.authoritativeHandoff.confidence && context.discovery.authoritativeHandoff.confidence >= 0.8) {
    return "high";
  }
  return context.domain?.confidence && context.domain.confidence >= 0.7 ? "high" : "medium";
}
