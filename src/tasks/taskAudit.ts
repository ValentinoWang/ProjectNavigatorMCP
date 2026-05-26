import { execFileSync } from "node:child_process";
import { openProject } from "../db/project.js";
import { matchesAnyPattern } from "../config/projectConfig.js";
import { loadTaskSession } from "./taskSession.js";

export interface ValidationResult {
  command: string;
  result: "passed" | "failed" | "skipped" | string;
}

export interface AuditViolation {
  severity: "warning" | "error";
  type: string;
  path?: string;
  command?: string;
  why: string;
}

export interface AuditTaskResult {
  audit: {
    result: "pass" | "warn" | "fail";
    score: number;
    violations: AuditViolation[];
    changedFilesByTier: Record<string, string[]>;
    missingValidations: string[];
    recommendedNextAction: string;
  };
}

export function auditTaskResult(
  repoPath: string,
  input: { taskSessionId: string; validationResults?: ValidationResult[] }
): AuditTaskResult {
  const session = loadTaskSession(repoPath, input.taskSessionId);
  if (!session) {
    return {
      audit: {
        result: "fail",
        score: 0,
        violations: [
          { severity: "error", type: "missing_session", why: `Task session not found: ${input.taskSessionId}` }
        ],
        changedFilesByTier: {},
        missingValidations: [],
        recommendedNextAction: "Create a new task session with pnav start or prepare_task_context."
      }
    };
  }
  const changedFiles = gitChangedFiles(repoPath);
  const boundary = session.editBoundaryV2;
  const violations: AuditViolation[] = [];
  const changedFilesByTier: Record<string, string[]> = {
    mustEdit: [],
    mayEdit: [],
    mayInspectTouched: [],
    referenceTouched: [],
    forbiddenTouched: [],
    unknownTouched: []
  };

  for (const file of changedFiles) {
    if (boundary.mustEditFiles.includes(file)) {
      changedFilesByTier.mustEdit.push(file);
    } else if (boundary.mayEditFiles.includes(file)) {
      changedFilesByTier.mayEdit.push(file);
    } else if (boundary.mayInspectFiles.includes(file)) {
      changedFilesByTier.mayInspectTouched.push(file);
      violations.push({ severity: "warning", type: "inspect_only_touched", path: file, why: "File was inspect-only." });
    } else if (boundary.referenceOnlyFiles.includes(file)) {
      changedFilesByTier.referenceTouched.push(file);
      violations.push({
        severity: "warning",
        type: "reference_only_touched",
        path: file,
        why: "Reference-only file was changed."
      });
    } else if (matchesAnyPattern(file, boundary.doNotTouchFiles)) {
      changedFilesByTier.forbiddenTouched.push(file);
      violations.push({
        severity: "error",
        type: "do_not_touch_touched",
        path: file,
        why: "File matches doNotTouchFiles."
      });
    } else {
      changedFilesByTier.unknownTouched.push(file);
      violations.push({
        severity: "warning",
        type: "out_of_boundary_file",
        path: file,
        why: "File is outside editBoundaryV2."
      });
    }
    if (/baseline|snapshot|golden/i.test(file)) {
      violations.push({
        severity: "warning",
        type: "baseline_or_snapshot_touched",
        path: file,
        why: "Baseline/snapshot/golden changes need explicit review."
      });
    }
    if (
      /scripts\/quality\/.*guard.*\.(py|sh)$/.test(file) &&
      !boundary.mustEditFiles.includes(file) &&
      !boundary.mayEditFiles.includes(file)
    ) {
      violations.push({
        severity: "error",
        type: "guard_script_touched",
        path: file,
        why: "Guard scripts are inspect-only unless explicitly editable."
      });
    }
  }

  const passedCommands = new Set(
    (input.validationResults ?? []).filter((item) => item.result === "passed").map((item) => item.command)
  );
  const requiredCommands = session.minimalRepairPath.steps
    .filter((step) => step.action === "run" && step.command)
    .map((step) => step.command as string);
  const missingValidations = requiredCommands.filter((command) => !passedCommands.has(command));
  for (const command of missingValidations) {
    violations.push({
      severity: "warning",
      type: "missing_validation",
      command,
      why: "Required minimal repair validation is not marked passed."
    });
  }

  const errorCount = violations.filter((item) => item.severity === "error").length;
  const warningCount = violations.filter((item) => item.severity === "warning").length;
  const score = Math.max(0, 1 - errorCount * 0.35 - warningCount * 0.12);
  const result = errorCount > 0 ? "fail" : warningCount > 0 ? "warn" : "pass";
  const audit = {
    result,
    score: Number(score.toFixed(2)),
    violations,
    changedFilesByTier,
    missingValidations,
    recommendedNextAction:
      result === "pass"
        ? "Record the task result."
        : "Fix boundary violations or provide explicit scope expansion, then run missing validations."
  } satisfies AuditTaskResult["audit"];
  storeAudit(repoPath, input.taskSessionId, audit, input.validationResults ?? []);
  return { audit };
}

function storeAudit(
  repoPath: string,
  sessionId: string,
  audit: AuditTaskResult["audit"],
  validations: ValidationResult[]
): void {
  const project = openProject(repoPath);
  try {
    project.db
      .prepare(
        `INSERT INTO finish_audits
          (repo_id, session_id, result, score, changed_files_json, violations_json, validations_json, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        project.repo.id,
        sessionId,
        audit.result,
        audit.score,
        JSON.stringify(audit.changedFilesByTier),
        JSON.stringify(audit.violations),
        JSON.stringify(validations),
        audit.recommendedNextAction
      );
  } finally {
    project.db.close();
  }
}

function gitChangedFiles(repoPath: string): string[] {
  try {
    return execFileSync("git", ["-C", repoPath, "diff", "--name-only"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
