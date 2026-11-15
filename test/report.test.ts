import { describe, expect, it } from "vitest";
import { markdownReport } from "../src/report.js";

describe("markdownReport", () => {
  it("lists changed files and validation output", () => {
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: [{ path: "src/index.ts", status: "modified" }],
      validationResults: [{ command: "npm test", status: "passed", output: "ok" }],
    });

    expect(report).toContain("src/index\\.ts (modified)");
    expect(report).toContain("npm test");
    expect(report).toContain("ok");
  });

  it("keeps untrusted output and filenames from changing report structure", () => {
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: [{ path: "bad\n## Forged", status: "modified" }],
      validationResults: [{ command: "check\n## Forged", status: "failed", output: "before\n```\n## forged output\n```" }],
    });

    expect(report).toContain("bad\\n\\#\\# Forged (modified)");
    expect(report).toContain("### check\\n\\#\\# Forged — failed");
    expect(report).toContain("````text");
    expect(report).toContain("```\n## forged output\n```");
  });
});
