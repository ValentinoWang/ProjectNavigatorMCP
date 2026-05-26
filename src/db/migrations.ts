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
    version: SCHEMA_VERSION,
    name: "initial_schema",
    sql: INITIAL_SCHEMA_SQL
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
    db.prepare("SELECT version FROM schema_migrations").all().map((row) => {
      const typed = row as { version: number };
      return typed.version;
    })
  );

  const applied: number[] = [];
  const runMigration = db.transaction((migration: Migration) => {
    db.exec(migration.sql);
    db.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(
      migration.version,
      migration.name
    );
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

