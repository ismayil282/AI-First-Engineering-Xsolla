import { describe, expect, it } from "vitest";
import { z } from "zod";
import { handleReviewRepository, reviewRepositoryInputSchema } from "../src/mcp-contract.js";

describe("MCP review contract", () => {
  const inputSchema = z.object(reviewRepositoryInputSchema).strict();

  it("accepts repo_path and returns an inspection report", async () => {
    const input = inputSchema.parse({ repo_path: process.cwd(), baseRef: "HEAD" });
    const result = await handleReviewRepository(input);
    expect(result.content[0].text).toContain("# Review Report:");
  });

  it("rejects validation commands so MCP cannot run them", () => {
    expect(() => inputSchema.parse({ repo_path: process.cwd(), validationCommands: ["whoami"] })).toThrow();
  });
});
