import type { ProjectDatabase } from "../db/connection.js";
import { readRepoTextFile } from "../scanner/fileScanner.js";
import type { ScannedFile } from "../scanner/types.js";
import { analyzeSourceDocument, type SourceDocumentAnalysis } from "./executionPlan.js";

export function scanSourceDocuments(repoRoot: string, files: ScannedFile[]): SourceDocumentAnalysis[] {
  return files
    .filter((file) => isMarkdown(file.path))
    .map((file) => {
      const content = readRepoTextFile(repoRoot, file.path, 600_000);
      if (!content || !content.startsWith("---")) {
        return null;
      }
      const analysis = analyzeSourceDocument(file.path, content);
      if (analysis.targets.length === 0 && analysis.steps.length === 0) {
        return null;
      }
      return analysis;
    })
    .filter((item): item is SourceDocumentAnalysis => item !== null);
}

export function insertSourceDocuments(
  db: ProjectDatabase,
  repoId: number,
  fileRows: Map<string, number>,
  documents: SourceDocumentAnalysis[]
): void {
  const insertDocument = db.prepare(
    `INSERT INTO documents
      (repo_id, path, doc_type, title, owner_domain, authority, frontmatter_json, summary, updated_at)
     VALUES (?, ?, 'markdown', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  );
  const insertTarget = db.prepare(
    `INSERT INTO document_targets
      (repo_id, document_id, kind, target_path, target_file_id, confidence, raw_value)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertStep = db.prepare(
    `INSERT INTO document_steps
      (repo_id, document_id, phase, ordinal, title, command, target_path, category, raw_text, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const write = db.transaction(() => {
    for (const doc of documents) {
      const result = insertDocument.run(
        repoId,
        doc.path,
        doc.title,
        doc.ownerDomain ?? null,
        doc.authority ?? null,
        JSON.stringify(doc.frontmatter.raw),
        doc.summary
      );
      const documentId = Number(result.lastInsertRowid);
      for (const target of doc.targets) {
        insertTarget.run(
          repoId,
          documentId,
          target.kind,
          target.targetPath,
          fileRows.get(target.targetPath) ?? null,
          target.confidence,
          target.rawValue
        );
      }
      for (const step of doc.steps) {
        insertStep.run(
          repoId,
          documentId,
          step.phase,
          step.ordinal,
          step.title,
          step.command,
          step.targetPath,
          step.category,
          step.rawText,
          step.confidence
        );
      }
    }
  });
  write();
}

function isMarkdown(filePath: string): boolean {
  return /\.(md|markdown)$/i.test(filePath);
}
