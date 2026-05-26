import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { analyzeGuardOutput } from "../guard/analyzeGuardOutput.js";
import { openProject } from "../db/project.js";
import { rememberTask } from "./memory.js";

export interface RecordTaskResultInput {
  title: string;
  task?: string;
  sourceDoc?: string;
  guardLog?: string;
  guardOutput?: string;
  guardCommand?: string;
  validations?: string[];
  result?: string;
  summary?: string;
}

export interface RecordTaskResultOutput {
  stored: true;
  memoryId: number;
  taskRunId: number;
  changedFiles: string[];
  guardRules: string[];
  validation: string[];
}

export function recordTaskResult(repoPath: string, input: RecordTaskResultInput): RecordTaskResultOutput {
  const guardOutput = input.guardOutput ?? (input.guardLog ? readFileSync(input.guardLog, "utf8") : "");
  const guardAnalysis = guardOutput
    ? analyzeGuardOutput(repoPath, guardOutput, { command: input.guardCommand, sourceDoc: input.sourceDoc })
    : null;
  const changedFiles = gitChangedFiles(repoPath);
  const guardRules = Array.from(new Set(guardAnalysis?.ruleMatches.map((match) => match.ruleId) ?? []));
  const validation = Array.from(
    new Set(
      [...(input.validations ?? []), ...(guardAnalysis?.validationCommands ?? []), input.guardCommand].filter(
        Boolean
      ) as string[]
    )
  );
  const summary =
    input.summary ??
    [
      input.task ?? input.title,
      guardRules.length > 0 ? `Guard rules: ${guardRules.join(", ")}` : null,
      changedFiles.length > 0 ? `Changed files: ${changedFiles.join(", ")}` : null,
      validation.length > 0 ? `Validation: ${validation.join("; ")}` : null,
      input.result ? `Result: ${input.result}` : null
    ]
      .filter(Boolean)
      .join("\n");

  const stored = rememberTask(repoPath, {
    title: input.title,
    summary,
    changedFiles,
    tests: validation,
    validation,
    tags: guardRules,
    memoryType: "task_result"
  });

  const project = openProject(repoPath);
  try {
    const result = project.db
      .prepare(
        `INSERT INTO task_runs
          (repo_id, title, task, source_doc, domain, guard_rules_json, guard_findings_json, changed_files_json, validation_json, result, summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        project.repo.id,
        input.title,
        input.task ?? null,
        input.sourceDoc ?? null,
        guardAnalysis?.ruleMatches[0]?.domain ?? null,
        JSON.stringify(guardRules),
        JSON.stringify(guardAnalysis?.findings ?? []),
        JSON.stringify(changedFiles),
        JSON.stringify(validation),
        input.result ?? null,
        summary
      );
    return {
      stored: true,
      memoryId: stored.memoryId,
      taskRunId: Number(result.lastInsertRowid),
      changedFiles,
      guardRules,
      validation
    };
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
