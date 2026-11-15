import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { handleReviewRepository, reviewRepositoryWithinRoots } from "../src/mcp-contract.js";

const tempDirs: string[] = [];

function makeRepo(): { repo: string; outputDir: string } {
  const root = mkdtempSync(join(tmpdir(), "inspector regression "));
  tempDirs.push(root);
  const repo = join(root, "repo");
  const outputDir = join(root, "caller");
  mkdirSync(repo);
  mkdirSync(outputDir);
  const git = (args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  git(["init", "-b", "main"]);
  git(["config", "user.email", "inspector-test@example.invalid"]);
  git(["config", "user.name", "Inspector Regression Test"]);
  writeFileSync(join(repo, "keep.txt"), "base\n");
  writeFileSync(join(repo, "remove.txt"), "remove\n");
  writeFileSync(join(repo, "rename-old.txt"), "rename me\n");
  git(["add", "."]);
  git(["commit", "-m", "base"]);
  return { repo, outputDir };
}

function cli(repo: string, cwd: string, validation?: string) {
  const args = ["review", "--repo", repo];
  if (validation !== undefined) args.push("--validate", validation);
  return runCli(args, cwd);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("CLI and MCP observable behavior", () => {
  it("reports committed changes against an unusual explicit base and omits untracked files", async () => {
    const { repo, outputDir } = makeRepo();
    execFileSync("git", ["checkout", "-b", "work-topic"], { cwd: repo, stdio: "ignore" });
    writeFileSync(join(repo, "keep.txt"), "changed\n");
    execFileSync("git", ["rm", "remove.txt"], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["mv", "rename-old.txt", "rename-new.txt"], { cwd: repo, stdio: "ignore" });
    writeFileSync(join(repo, "new.txt"), "new\n");
    const oddPath = "odd\tline\nbreak.txt";
    const extraPaths = process.platform === "win32" ? [] : [oddPath];
    if (extraPaths.length) writeFileSync(join(repo, oddPath), "odd name\n");
    execFileSync("git", ["add", "new.txt", "keep.txt", ...extraPaths], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "topic changes"], { cwd: repo, stdio: "ignore" });
    writeFileSync(join(repo, "untracked.txt"), "not committed\n");

    const result = await cli(repo, outputDir);
    expect(result).toBe(true);
    const cliReport = readFileSync(join(outputDir, "review-report.md"), "utf8");
    expect(cliReport).toContain("keep\\.txt (modified)");
    expect(cliReport).toContain("remove\\.txt (deleted)");
    expect(cliReport).toContain("rename-old\\.txt (deleted)");
    expect(cliReport).toContain("rename-new\\.txt (added)");
    expect(cliReport).toContain("new\\.txt (added)");
    if (extraPaths.length) expect(cliReport).toContain("odd\\tline\\nbreak.txt (added)");
    expect(cliReport).not.toContain("untracked.txt");

    const previousRoots = process.env.INSPECTOR_ALLOWED_REPOS;
    process.env.INSPECTOR_ALLOWED_REPOS = repo;
    let mcp;
    try {
      mcp = await handleReviewRepository({ repo_path: repo, baseRef: "main" });
    } finally {
      if (previousRoots === undefined) delete process.env.INSPECTOR_ALLOWED_REPOS;
      else process.env.INSPECTOR_ALLOWED_REPOS = previousRoots;
    }
    expect(mcp.content[0].text).toBe(cliReport);
  });

  it("returns a normal empty-change report when there are no committed changes", async () => {
    const { repo, outputDir } = makeRepo();
    const result = await cli(repo, outputDir);
    expect(result).toBe(true);
    expect(readFileSync(join(outputDir, "review-report.md"), "utf8")).toContain("## Changed files");
  });

  it("keeps validation failure in the report and reports successful local validation", async () => {
    const { repo, outputDir } = makeRepo();
    const passed = await cli(repo, outputDir, "npm --version");
    expect(passed).toBe(true);
    expect(readFileSync(join(outputDir, "review-report.md"), "utf8")).toContain("npm --version — passed");

    const failed = await cli(repo, outputDir, `"${process.execPath}" -e "process.exit(7)"`);
    expect(failed).toBe(true);
    expect(readFileSync(join(outputDir, "review-report.md"), "utf8")).toContain("— failed");
  });

  it("fails clearly for a missing MCP repository path", async () => {
    await expect(handleReviewRepository({ repo_path: join(tmpdir(), "missing-inspector-repo"), baseRef: "main" })).rejects.toThrow();
  });

  it("blocks MCP inspection outside explicitly allowed roots", async () => {
    const { repo, outputDir } = makeRepo();
    await expect(reviewRepositoryWithinRoots({ repo_path: repo, baseRef: "main" }, [outputDir])).rejects.toThrow("outside the configured");
  });

  it("blocks nested paths whose discovered Git worktree escapes the allowed root", async () => {
    const { repo } = makeRepo();
    const nested = join(repo, "nested");
    mkdirSync(nested);
    await expect(reviewRepositoryWithinRoots({ repo_path: nested, baseRef: "main" }, [nested])).rejects.toThrow("Git repository root is outside");
  });
});
