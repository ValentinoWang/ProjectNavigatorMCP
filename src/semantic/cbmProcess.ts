import { spawn } from "node:child_process";
import { SemanticBackendError } from "./errors.js";

export const DEFAULT_CBM_BINARY = "codebase-memory-mcp";
export const DEFAULT_CBM_TIMEOUT_MS = 15_000;
export const DEFAULT_CBM_INDEX_TIMEOUT_MS = 10 * 60_000;
export const DEFAULT_CBM_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export interface CbmProcessOptions {
  binary?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
}

export interface CbmToolEnvelope {
  content?: Array<{ type?: unknown; text?: unknown }>;
  structuredContent?: unknown;
  isError?: unknown;
}

export async function readCbmVersion(options: CbmProcessOptions = {}): Promise<string> {
  const result = await runProcess(options.binary ?? DEFAULT_CBM_BINARY, ["--version"], undefined, options);
  const match = result.stdout.trim().match(/(?:codebase-memory-mcp\s+)?v?([0-9]+\.[0-9]+\.[0-9]+(?:[-+][^\s]+)?)/i);
  if (!match) {
    throw new SemanticBackendError("invalid_response", "CBM --version returned an unrecognized value.", {
      stdout: boundedDiagnostic(result.stdout)
    });
  }
  return match[1];
}

export async function callCbmTool(
  tool: string,
  args: Record<string, unknown>,
  options: CbmProcessOptions = {}
): Promise<Record<string, unknown>> {
  const result = await runProcess(
    options.binary ?? DEFAULT_CBM_BINARY,
    ["cli", "--json", tool],
    `${JSON.stringify(args)}\n`,
    options
  );
  let envelope: CbmToolEnvelope;
  try {
    envelope = JSON.parse(result.stdout) as CbmToolEnvelope;
  } catch {
    throw new SemanticBackendError("invalid_response", `CBM ${tool} returned invalid JSON.`, {
      stdout: boundedDiagnostic(result.stdout),
      stderr: boundedDiagnostic(result.stderr)
    });
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new SemanticBackendError("invalid_response", `CBM ${tool} returned an invalid MCP envelope.`);
  }
  if (envelope.isError === true) {
    throw new SemanticBackendError("tool_error", extractToolError(envelope, tool), {
      tool,
      stderr: boundedDiagnostic(result.stderr)
    });
  }
  const payload = extractStructuredPayload(envelope);
  if (!payload) {
    throw new SemanticBackendError("invalid_response", `CBM ${tool} did not return structured JSON content.`, {
      tool
    });
  }
  return payload;
}

async function runProcess(
  binary: string,
  args: string[],
  input: string | undefined,
  options: CbmProcessOptions
): Promise<{ stdout: string; stderr: string }> {
  if (!binary || binary.includes("\0")) {
    throw new SemanticBackendError("unavailable", "CBM binary path is invalid.");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_CBM_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_CBM_MAX_OUTPUT_BYTES;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new SemanticBackendError("unavailable", "CBM timeout must be a positive finite number.");
  }
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    throw new SemanticBackendError("unavailable", "CBM output limit must be a positive safe integer.");
  }
  return await new Promise((resolve, reject) => {
    let settled = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const child = spawn(binary, args, {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: options.env ?? process.env
    });
    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const failForLimit = (stream: "stdout" | "stderr"): void => {
      child.kill("SIGKILL");
      finish(() =>
        reject(
          new SemanticBackendError("output_limit", `CBM ${stream} exceeded ${maxOutputBytes} bytes.`, {
            stream,
            maxOutputBytes
          })
        )
      );
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxOutputBytes) {
        failForLimit("stdout");
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > maxOutputBytes) {
        failForLimit("stderr");
        return;
      }
      stderr.push(chunk);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish(() =>
        reject(
          new SemanticBackendError(
            "unavailable",
            error.code === "ENOENT" ? `CBM binary not found: ${binary}` : `Unable to start CBM: ${error.message}`,
            { binary, code: error.code ?? null }
          )
        )
      );
    });
    child.on("close", (code, signal) => {
      finish(() => {
        const stdoutText = Buffer.concat(stdout).toString("utf8");
        const stderrText = Buffer.concat(stderr).toString("utf8");
        if (code !== 0) {
          reject(
            new SemanticBackendError("tool_error", `CBM exited with status ${code ?? "unknown"}.`, {
              binary,
              code,
              signal,
              stdout: boundedDiagnostic(stdoutText),
              stderr: boundedDiagnostic(stderrText)
            })
          );
          return;
        }
        resolve({ stdout: stdoutText, stderr: stderrText });
      });
    });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (settled || error.code === "EPIPE") {
        return;
      }
      finish(() =>
        reject(
          new SemanticBackendError("tool_error", `Unable to send CBM request: ${error.message}`, {
            binary,
            code: error.code ?? null
          })
        )
      );
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() =>
        reject(
          new SemanticBackendError("timeout", `CBM exceeded the ${timeoutMs} ms timeout.`, {
            binary,
            timeoutMs
          })
        )
      );
    }, timeoutMs);
    timer.unref();
    if (input === undefined) {
      child.stdin.end();
    } else {
      child.stdin.end(input, "utf8");
    }
  });
}

function extractStructuredPayload(envelope: CbmToolEnvelope): Record<string, unknown> | null {
  if (isRecord(envelope.structuredContent)) {
    return envelope.structuredContent;
  }
  const text = envelope.content?.find((item) => item.type === "text" && typeof item.text === "string")?.text;
  if (typeof text !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractToolError(envelope: CbmToolEnvelope, tool: string): string {
  if (isRecord(envelope.structuredContent) && typeof envelope.structuredContent.error === "string") {
    return `CBM ${tool} failed: ${envelope.structuredContent.error}`;
  }
  const text = envelope.content?.find((item) => item.type === "text" && typeof item.text === "string")?.text;
  return typeof text === "string" && text.trim() ? `CBM ${tool} failed: ${text.trim()}` : `CBM ${tool} failed.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedDiagnostic(value: string): string {
  return value.trim().slice(0, 2_000);
}
