import { z } from "zod";
import { realpathSync } from "node:fs";
import { delimiter, isAbsolute, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { inspectRepository } from "./core.js";

export const reviewRepositoryInputSchema = {
  repo_path: z.string().min(1).describe("Repository path to inspect."),
  baseRef: z.string().optional(),
};

export const strictReviewRepositoryInputSchema = z.object(reviewRepositoryInputSchema).strict();

export async function reviewRepositoryWithinRoots(
  input: z.infer<typeof strictReviewRepositoryInputSchema>,
  allowedRoots: string[],
) {
  const target = realpathSync(input.repo_path);
  const roots = allowedRoots.map((root) => realpathSync(resolve(root)));
  const isWithinAllowedRoot = (path: string) => roots.some((root) => {
    const rel = relative(root, path);
    return rel === "" || (rel !== ".." && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(rel));
  });
  if (!isWithinAllowedRoot(target)) {
    throw new Error("Repository path is outside the configured MCP inspection roots.");
  }
  const gitRootOutput = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: target, encoding: "utf8" });
  const gitRoot = realpathSync(gitRootOutput.replace(/\r?\n$/, ""));
  if (!isWithinAllowedRoot(gitRoot)) {
    throw new Error("Git repository root is outside the configured MCP inspection roots.");
  }
  const report = inspectRepository({
    repositoryPath: target,
    baseRef: input.baseRef,
  });
  return { content: [{ type: "text" as const, text: report }] };
}

export async function handleReviewRepository(input: z.infer<typeof strictReviewRepositoryInputSchema>) {
  const roots = (process.env.INSPECTOR_ALLOWED_REPOS ?? process.cwd()).split(delimiter).filter(Boolean);
  return reviewRepositoryWithinRoots(input, roots);
}
