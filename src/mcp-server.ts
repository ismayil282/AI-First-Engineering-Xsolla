#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { handleReviewRepository, strictReviewRepositoryInputSchema } from "./mcp-contract.js";

const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });

server.registerTool(
  "review_repository",
  {
    description: "Inspects an allowed Git repository and returns a review report. Does not run commands.",
    inputSchema: strictReviewRepositoryInputSchema,
  },
  handleReviewRepository,
);

await server.connect(new StdioServerTransport());
