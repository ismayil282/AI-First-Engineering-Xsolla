import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
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
  if (!tokens.length) throw new Error("Validation command must not be empty.");
  return { executable: tokens[0], args: tokens.slice(1) };
}

function bounded(text: string, maxOutputBytes: number): string {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length <= maxOutputBytes) return text;
  return `${bytes.subarray(0, maxOutputBytes).toString("utf8")}\n[output truncated at ${maxOutputBytes} bytes]`;
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
    execFile(parsed.executable, parsed.args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: maxOutputBytes,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      const output = bounded([stdout, stderr, error?.killed ? `Timed out after ${timeoutMs} ms.` : "", error && !error.killed ? `Execution failed: ${error.message}` : ""]
        .filter(Boolean).join("\n"), maxOutputBytes);
      resolve({ command, status: error ? "failed" : "passed", output });
    });
  });
}

export async function runValidations(commands: string[], cwd: string): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) results.push(await runValidation(command, cwd));
  return results;
}
