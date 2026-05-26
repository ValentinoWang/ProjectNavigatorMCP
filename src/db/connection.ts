import Database from "better-sqlite3";

export type ProjectDatabase = Database.Database;

export function openDatabase(dbPath: string): ProjectDatabase {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

