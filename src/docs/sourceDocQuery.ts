import { existsSync } from "node:fs";
import path from "node:path";
import { openProject } from "../db/project.js";
import { readRepoTextFile } from "../scanner/fileScanner.js";
import { analyzeSourceDocument, type SourceDocumentAnalysis } from "./executionPlan.js";

export interface StoredSourceDoc {
  path: string;
  title: string | null;
  ownerDomain: string | null;
  authority: string | null;
  syncTargets: string[];
  dependsOn: string[];
  validation: string[];
  parseMode: "frontmatter" | "inferred" | "mixed";
  docConfidence: number;
  sourceWarnings: string[];
  targets: Array<{
    kind: string;
    targetPath: string;
    confidence: number;
    rawValue: string | null;
  }>;
  steps: Array<{
    phase: string | null;
    ordinal: number;
    title: string | null;
    command: string | null;
    targetPath: string | null;
    category: string;
    rawText: string;
    confidence: number;
  }>;
}

export function loadSourceDoc(
  repoPath: string,
  sourceDocPath: string
): { doc: StoredSourceDoc | null; warning?: string } {
  const normalizedPath = normalizeInputPath(repoPath, sourceDocPath);
  const project = openProject(repoPath);
  try {
    const row = project.db
      .prepare(
        `SELECT id, path, title, owner_domain AS ownerDomain, authority, frontmatter_json AS frontmatterJson,
                parse_mode AS parseMode, doc_confidence AS docConfidence, source_warnings_json AS sourceWarningsJson
         FROM documents WHERE repo_id = ? AND path = ?`
      )
      .get(project.repo.id, normalizedPath) as
      | {
          id: number;
          path: string;
          title: string | null;
          ownerDomain: string | null;
          authority: string | null;
          frontmatterJson: string;
          parseMode: "frontmatter" | "inferred" | "mixed";
          docConfidence: number;
          sourceWarningsJson: string;
        }
      | undefined;
    if (row) {
      const targets = project.db
        .prepare(
          "SELECT kind, target_path AS targetPath, confidence, raw_value AS rawValue FROM document_targets WHERE repo_id = ? AND document_id = ? ORDER BY confidence DESC, id"
        )
        .all(project.repo.id, row.id) as StoredSourceDoc["targets"];
      const steps = project.db
        .prepare(
          `SELECT phase, ordinal, title, command, target_path AS targetPath, category, raw_text AS rawText, confidence
           FROM document_steps WHERE repo_id = ? AND document_id = ? ORDER BY ordinal, id`
        )
        .all(project.repo.id, row.id) as StoredSourceDoc["steps"];
      const frontmatter = JSON.parse(row.frontmatterJson) as Record<string, string | string[]>;
      return {
        doc: {
          path: row.path,
          title: row.title,
          ownerDomain: row.ownerDomain,
          authority: row.authority,
          syncTargets: asArray(frontmatter.sync_targets),
          dependsOn: asArray(frontmatter.depends_on),
          validation: asArray(frontmatter.validation),
          parseMode: row.parseMode,
          docConfidence: row.docConfidence,
          sourceWarnings: asArray(JSON.parse(row.sourceWarningsJson) as string[]),
          targets,
          steps
        }
      };
    }
  } finally {
    project.db.close();
  }

  const content = readRepoTextFile(repoPath, normalizedPath, 600_000);
  if (!content) {
    return { doc: null, warning: `source_doc was not found or could not be read: ${normalizedPath}` };
  }
  const analyzed = analyzeSourceDocument(normalizedPath, content);
  return {
    doc: fromAnalysis(analyzed),
    warning: `source_doc is not indexed yet; analyzed file directly: ${normalizedPath}`
  };
}

function fromAnalysis(doc: SourceDocumentAnalysis): StoredSourceDoc {
  return {
    path: doc.path,
    title: doc.title,
    ownerDomain: doc.ownerDomain ?? null,
    authority: doc.authority ?? null,
    syncTargets: doc.frontmatter.syncTargets,
    dependsOn: doc.frontmatter.dependsOn,
    validation: doc.frontmatter.validation,
    parseMode: doc.parseMode,
    docConfidence: doc.docConfidence,
    sourceWarnings: doc.warnings,
    targets: doc.targets.map((target) => ({
      kind: target.kind,
      targetPath: target.targetPath,
      confidence: target.confidence,
      rawValue: target.rawValue
    })),
    steps: doc.steps.map((step) => ({
      phase: step.phase,
      ordinal: step.ordinal,
      title: step.title,
      command: step.command,
      targetPath: step.targetPath,
      category: step.category,
      rawText: step.rawText,
      confidence: step.confidence
    }))
  };
}

function normalizeInputPath(repoPath: string, sourceDocPath: string): string {
  if (path.isAbsolute(sourceDocPath)) {
    const relative = path.relative(repoPath, sourceDocPath);
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
      return relative.split(path.sep).join("/");
    }
  }
  const normalized = sourceDocPath
    .replace(/^\.\/+/, "")
    .split(path.sep)
    .join("/");
  if (existsSync(path.join(repoPath, normalized))) {
    return normalized;
  }
  return normalized;
}

function asArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  return typeof value === "string" && value.length > 0 ? [value] : [];
}
