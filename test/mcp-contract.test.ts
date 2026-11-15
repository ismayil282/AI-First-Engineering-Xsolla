import { describe, expect, it } from "vitest";
import { handleReviewRepository, strictReviewRepositoryInputSchema } from "../src/mcp-contract.js";

describe("MCP review contract", () => {
  it("accepts repo_path and returns an inspection report", async () => {
    const input = strictReviewRepositoryInputSchema.parse({ repo_path: process.cwd(), baseRef: "HEAD" });
    const result = await handleReviewRepository(input);
    expect(result.content[0].text).toContain("# Review Report:");
  });

  it("rejects validation commands so MCP cannot run them", () => {
    expect(() => strictReviewRepositoryInputSchema.parse({ repo_path: process.cwd(), validationCommands: ["whoami"] })).toThrow();
  });

  it("requires a non-empty repo_path", () => {
    expect(() => strictReviewRepositoryInputSchema.parse({})).toThrow();
    expect(() => strictReviewRepositoryInputSchema.parse({ repo_path: "" })).toThrow();
  });
});
