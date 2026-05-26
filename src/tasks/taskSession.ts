import { execFileSync } from "node:child_process";
import { openProject } from "../db/project.js";
import { getWorktreeStatus } from "../git/worktreeStatus.js";
import type { EditBoundaryV2 } from "../planner/editBoundaryV2.js";
import type { MinimalRepairPath } from "../planner/repairPathTypes.js";

export interface TaskSessionInput {
  task: string;
  sourceDoc?: string;
  domain?: string | null;
  editBoundaryV2: EditBoundaryV2;
  minimalRepairPath: MinimalRepairPath;
}

export interface TaskSession {
  taskSessionId: string;
  baselineGitSha: string | null;
  baselineStatus: ReturnType<typeof getWorktreeStatus>;
}

export function createTaskSession(repoPath: string, input: TaskSessionInput): TaskSession {
  const sessionId = `tsk_${new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`;
  const baselineGitSha = gitSha(repoPath);
  const baselineStatus = getWorktreeStatus(repoPath);
  const boundaryJson = JSON.stringify({
    editBoundaryV2: input.editBoundaryV2,
    minimalRepairPath: input.minimalRepairPath
  });
  const project = openProject(repoPath);
  try {
    project.db
      .prepare(
        `INSERT INTO task_sessions
          (repo_id, session_id, task, source_doc, domain, baseline_git_sha, baseline_status_json, boundary_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        project.repo.id,
        sessionId,
        input.task,
        input.sourceDoc ?? null,
        input.domain ?? null,
        baselineGitSha,
        JSON.stringify(baselineStatus),
        boundaryJson
      );
    const insertFile = project.db.prepare(
      `INSERT INTO task_session_files (session_id, repo_id, path, tier, reason, evidence_json, baseline_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const [tier, files] of Object.entries(filesByTier(input.editBoundaryV2))) {
      for (const file of files) {
        insertFile.run(sessionId, project.repo.id, file, tier, `Captured from editBoundaryV2.${tier}`, "[]", null);
      }
    }
  } finally {
    project.db.close();
  }
  return { taskSessionId: sessionId, baselineGitSha, baselineStatus };
}

export function loadTaskSession(repoPath: string, taskSessionId: string): (TaskSessionInput & TaskSession) | null {
  const project = openProject(repoPath);
  try {
    const row = project.db
      .prepare(
        `SELECT session_id AS taskSessionId, task, source_doc AS sourceDoc, domain,
                baseline_git_sha AS baselineGitSha, baseline_status_json AS baselineStatusJson, boundary_json AS boundaryJson
         FROM task_sessions WHERE repo_id = ? AND session_id = ?`
      )
      .get(project.repo.id, taskSessionId) as
      | {
          taskSessionId: string;
          task: string;
          sourceDoc: string | null;
          domain: string | null;
          baselineGitSha: string | null;
          baselineStatusJson: string;
          boundaryJson: string;
        }
      | undefined;
    if (!row) {
      return null;
    }
    const boundary = JSON.parse(row.boundaryJson) as {
      editBoundaryV2: EditBoundaryV2;
      minimalRepairPath: MinimalRepairPath;
    };
    return {
      taskSessionId: row.taskSessionId,
      task: row.task,
      sourceDoc: row.sourceDoc ?? undefined,
      domain: row.domain,
      baselineGitSha: row.baselineGitSha,
      baselineStatus: JSON.parse(row.baselineStatusJson) as ReturnType<typeof getWorktreeStatus>,
      editBoundaryV2: boundary.editBoundaryV2,
      minimalRepairPath: boundary.minimalRepairPath
    };
  } finally {
    project.db.close();
  }
}

function filesByTier(boundary: EditBoundaryV2): Record<string, string[]> {
  return {
    must_edit: boundary.mustEditFiles,
    may_edit: boundary.mayEditFiles,
    may_inspect: boundary.mayInspectFiles,
    reference_only: boundary.referenceOnlyFiles,
    do_not_touch: boundary.doNotTouchFiles
  };
}

function gitSha(repoPath: string): string | null {
  try {
    return execFileSync("git", ["-C", repoPath, "rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}
