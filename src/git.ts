import { execFileSync } from "node:child_process";
import type { ChangedFile } from "./types.js";

function git(repositoryPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
  });
}

export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  const base = baseRef ?? "main";
  if (base.startsWith("-") || /[\0\r\n]/.test(base)) throw new Error("Invalid base ref.");
  const output = git(repositoryPath, ["diff", "--name-status", "-z", `${base}...HEAD`]);

  const fields = output.split("\0").filter(Boolean);
  const files: ChangedFile[] = [];
  for (let index = 0; index < fields.length;) {
    const code = fields[index++];
    const path = fields[index++];
    if (!code || path === undefined) throw new Error("Git returned malformed name-status output.");
    if (code.startsWith("R") && index < fields.length) {
      // ChangedFile has no rename status; preserve both paths as removal/addition.
      files.push({ path, status: "deleted" }, { path: fields[index++], status: "added" });
      continue;
    }
    const status = code === "A" ? "added" : code === "D" ? "deleted" : "modified";
    files.push({ path, status });
  }
  return files;
}
