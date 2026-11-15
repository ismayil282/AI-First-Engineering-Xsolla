import { execFileSync } from "node:child_process";
import type { ChangedFile } from "./types.js";

function git(repositoryPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
  }).trim();
}

export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  const base = baseRef ?? "main";
  const output = git(repositoryPath, ["diff", "--name-status", `${base}...HEAD`]);

  const files: ChangedFile[] = [];
  for (const line of output.split("\n").filter(Boolean)) {
    const [code, ...paths] = line.split("\t");
    if (code.startsWith("R") && paths.length === 2) {
      // ChangedFile has no rename status; preserve both paths as a removal/addition.
      files.push({ path: paths[0], status: "deleted" }, { path: paths[1], status: "added" });
      continue;
    }
    const status = code === "A" ? "added" : code === "D" ? "deleted" : "modified";
    files.push({ path: paths.join("\t"), status });
  }
  return files;
}
