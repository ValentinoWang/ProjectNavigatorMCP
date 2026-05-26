import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { openDatabase } from "../../db/connection.js";
import { PACKAGE_NAME, PACKAGE_VERSION } from "../../shared/packageInfo.js";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DoctorReport {
  packageName: string;
  packageVersion: string;
  checks: DoctorCheck[];
}

function checkGit(): DoctorCheck {
  try {
    const version = execFileSync("git", ["--version"], { encoding: "utf8" }).trim();
    return { name: "git", ok: true, detail: version };
  } catch (error) {
    return {
      name: "git",
      ok: false,
      detail: error instanceof Error ? error.message : "git check failed"
    };
  }
}

function checkSQLite(): DoctorCheck {
  const dir = mkdtempSync(path.join(tmpdir(), "pnav-doctor-"));
  const dbPath = path.join(dir, "doctor.sqlite");
  try {
    const db = openDatabase(dbPath);
    const row = db.prepare("SELECT sqlite_version() AS version").get() as { version: string };
    db.close();
    return { name: "sqlite", ok: true, detail: `sqlite ${row.version}` };
  } catch (error) {
    return {
      name: "sqlite",
      ok: false,
      detail: error instanceof Error ? error.message : "sqlite check failed"
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function getDoctorReport(): DoctorReport {
  return {
    packageName: PACKAGE_NAME,
    packageVersion: PACKAGE_VERSION,
    checks: [
      { name: "node", ok: true, detail: process.version },
      checkGit(),
      checkSQLite()
    ]
  };
}

export function renderDoctorReport(report: DoctorReport): string {
  const lines = [`${report.packageName} ${report.packageVersion}`];
  for (const check of report.checks) {
    lines.push(`${check.ok ? "OK" : "FAIL"} ${check.name}: ${check.detail}`);
  }
  return lines.join("\n");
}

