#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { handleReviewRepository, reviewRepositoryInputSchema } from "./mcp-contract.js";

const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });

server.tool(
  "review_repository",
  "Inspects a Git repository and returns a review report.",
  reviewRepositoryInputSchema,
  handleReviewRepository,
);

await server.connect(new StdioServerTransport());
