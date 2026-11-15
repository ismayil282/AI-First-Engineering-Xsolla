import { spawn, type ChildProcessByStdio } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Readable } from "node:stream";
import type { ValidationResult } from "./types.js";

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

// Accept a command plus quoted arguments, but reject shell operators and expansion.
function parseCommand(command: string): { executable: string; args: string[] } {
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | undefined;
  let started = false;
  for (const char of command.trim()) {
    if (quote) {
      if (char === quote) quote = undefined;
      else token += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (/[;&|<>`$\n\r]/.test(char)) {
      throw new Error("Shell operators and expansions are not supported in validation commands.");
    } else if (/\s/.test(char)) {
      if (started) { tokens.push(token); token = ""; started = false; }
    } else {
      token += char;
      started = true;
    }
  }
  if (quote) throw new Error("Unclosed quote in validation command.");
  if (started) tokens.push(token);
  if (!tokens.length || !tokens[0]) throw new Error("Validation command must not be empty.");
  return { executable: tokens[0], args: tokens.slice(1) };
}

export function runValidation(
  command: string,
  cwd: string,
  options: { timeoutMs?: number; maxOutputBytes?: number } = {},
): Promise<ValidationResult> {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? MAX_OUTPUT_BYTES;
  let parsed: { executable: string; args: string[] };
  try {
    parsed = parseCommand(command);
  } catch (error) {
    return Promise.resolve({ command, status: "failed", output: String(error) });
  }
  // Windows cannot launch .cmd files through execFile without a shell. Invoke
  // npm's JavaScript entry point directly so the documented `npm test` works
  // while retaining shell-free process creation.
  if (process.platform === "win32" && /^npm(?:\.cmd)?$/i.test(parsed.executable)) {
    const npmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
    if (existsSync(npmCli)) parsed = { executable: process.execPath, args: [npmCli, ...parsed.args] };
  }
  return new Promise((resolve) => {
    let outputBytes = 0;
    let truncated = false;
    let timedOut = false;
    let spawnError: Error | undefined;
    const chunks: Buffer[] = [];
    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(parsed.executable, parsed.args, {
        cwd,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({ command, status: "failed", output: `Execution failed: ${String(error)}` });
      return;
    }
    let settled = false;
    let timer: NodeJS.Timeout;
    const capture = (chunk: Buffer) => {
      const remaining = Math.max(0, maxOutputBytes - outputBytes);
      if (remaining) {
        const kept = chunk.subarray(0, remaining);
        chunks.push(kept);
        outputBytes += kept.length;
      }
      if (chunk.length > remaining) truncated = true;
    };
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const parts = [Buffer.concat(chunks).toString("utf8")];
      if (timedOut) parts.push(`Timed out after ${timeoutMs} ms.`);
      if (spawnError) parts.push(`Execution failed: ${spawnError.message}`);
      if (code !== 0 && !timedOut && !spawnError) parts.push(`Process exited with code ${code}.`);
      if (truncated) parts.push(`[output truncated at ${maxOutputBytes} bytes]`);
      resolve({ command, status: code === 0 && !timedOut && !spawnError ? "passed" : "failed", output: parts.filter(Boolean).join("\n") });
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.on("error", (error) => { spawnError = error; });
    timer = setTimeout(() => {
      timedOut = true;
      if (child.pid && process.platform !== "win32") {
        try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
      } else if (child.pid && process.platform === "win32") {
        try {
          const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
          killer.on("error", () => child.kill("SIGKILL"));
          killer.on("close", (code) => { if (code !== 0) child.kill("SIGKILL"); });
        } catch {
          child.kill("SIGKILL");
        }
      } else child.kill("SIGKILL");
      finish(null);
    }, timeoutMs);
    child.on("close", finish);
  });
}

export async function runValidations(commands: string[], cwd: string): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) results.push(await runValidation(command, cwd));
  return results;
}
