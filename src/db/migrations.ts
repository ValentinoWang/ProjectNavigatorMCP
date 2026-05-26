import type { ProjectDatabase } from "./connection.js";
import { INITIAL_SCHEMA_SQL, SCHEMA_VERSION } from "./schema.js";

export interface MigrationResult {
  applied: number[];
  currentVersion: number;
}

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    sql: INITIAL_SCHEMA_SQL
  },
  {
    version: 2,
    name: "fts_and_memory_contract",
    sql: `
      ALTER TABLE symbols ADD COLUMN signature TEXT;
      ALTER TABLE symbols ADD COLUMN qualified_name TEXT;
      ALTER TABLE memories ADD COLUMN memory_type TEXT NOT NULL DEFAULT 'task';
      ALTER TABLE memories ADD COLUMN decisions_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE memories ADD COLUMN pitfalls_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE memories ADD COLUMN validation_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE memories ADD COLUMN confidence REAL NOT NULL DEFAULT 1.0;
      ALTER TABLE memories ADD COLUMN stale_after TEXT;
      CREATE TABLE IF NOT EXISTS memory_tags (
        memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        PRIMARY KEY(memory_id, tag)
      );
      CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
        INSERT INTO files_fts(rowid, path, language) VALUES (new.id, new.path, new.language);
      END;
      CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
        INSERT INTO files_fts(files_fts, rowid, path, language) VALUES('delete', old.id, old.path, old.language);
      END;
      CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN
        INSERT INTO symbols_fts(rowid, name, kind) VALUES (new.id, new.name, new.kind);
      END;
      CREATE TRIGGER IF NOT EXISTS symbols_ad AFTER DELETE ON symbols BEGIN
        INSERT INTO symbols_fts(symbols_fts, rowid, name, kind) VALUES('delete', old.id, old.name, old.kind);
      END;
      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, topic, summary) VALUES (new.id, new.topic, new.summary);
      END;
      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, topic, summary) VALUES('delete', old.id, old.topic, old.summary);
      END;
      INSERT INTO files_fts(rowid, path, language)
        SELECT id, path, language FROM files
        WHERE id NOT IN (SELECT rowid FROM files_fts);
      INSERT INTO symbols_fts(rowid, name, kind)
        SELECT id, name, kind FROM symbols
        WHERE id NOT IN (SELECT rowid FROM symbols_fts);
      INSERT INTO memories_fts(rowid, topic, summary)
        SELECT id, topic, summary FROM memories
        WHERE id NOT IN (SELECT rowid FROM memories_fts);
    `
  },
  {
    version: 3,
    name: "source_documents",
    sql: `
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        doc_type TEXT NOT NULL DEFAULT 'markdown',
        title TEXT,
        owner_domain TEXT,
        authority TEXT,
        frontmatter_json TEXT NOT NULL DEFAULT '{}',
        summary TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(repo_id, path)
      );
      CREATE TABLE IF NOT EXISTS document_targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        target_path TEXT NOT NULL,
        target_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
        confidence REAL NOT NULL DEFAULT 1.0,
        raw_value TEXT
      );
      CREATE TABLE IF NOT EXISTS document_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        phase TEXT,
        ordinal INTEGER NOT NULL DEFAULT 0,
        title TEXT,
        command TEXT,
        target_path TEXT,
        category TEXT NOT NULL DEFAULT 'step',
        raw_text TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.7
      );
      CREATE INDEX IF NOT EXISTS idx_documents_repo_path ON documents(repo_id, path);
      CREATE INDEX IF NOT EXISTS idx_document_targets_repo_path ON document_targets(repo_id, target_path);
      CREATE INDEX IF NOT EXISTS idx_document_steps_repo_document ON document_steps(repo_id, document_id, ordinal);
    `
  },
  {
    version: 4,
    name: "execution_ready_secretary",
    sql: `
      CREATE TABLE IF NOT EXISTS guard_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        rule_id TEXT NOT NULL,
        domain TEXT,
        severity TEXT NOT NULL DEFAULT 'warning',
        matcher_json TEXT NOT NULL DEFAULT '{}',
        canonical_paths_json TEXT NOT NULL DEFAULT '[]',
        recipe_json TEXT NOT NULL DEFAULT '{}',
        validation_commands_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(repo_id, rule_id)
      );
      CREATE TABLE IF NOT EXISTS task_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        task TEXT,
        source_doc TEXT,
        domain TEXT,
        guard_rules_json TEXT NOT NULL DEFAULT '[]',
        guard_findings_json TEXT NOT NULL DEFAULT '[]',
        changed_files_json TEXT NOT NULL DEFAULT '[]',
        validation_json TEXT NOT NULL DEFAULT '[]',
        result TEXT,
        summary TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_guard_rules_repo_rule ON guard_rules(repo_id, rule_id);
      CREATE INDEX IF NOT EXISTS idx_task_runs_repo_created ON task_runs(repo_id, created_at);
      ALTER TABLE documents ADD COLUMN parse_mode TEXT NOT NULL DEFAULT 'frontmatter';
      ALTER TABLE documents ADD COLUMN doc_confidence REAL NOT NULL DEFAULT 1.0;
      ALTER TABLE documents ADD COLUMN source_warnings_json TEXT NOT NULL DEFAULT '[]';
    `
  }
];

export function migrate(db: ProjectDatabase): MigrationResult {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedVersions = new Set(
    db
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((row) => {
        const typed = row as { version: number };
        return typed.version;
      })
  );

  const applied: number[] = [];
  const runMigration = db.transaction((migration: Migration) => {
    db.exec(migration.sql);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(migration.version, migration.name);
  });

  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }
    runMigration(migration);
    applied.push(migration.version);
  }

  return {
    applied,
    currentVersion: SCHEMA_VERSION
  };
}
