#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { reviewRepository } from "./core.js";

type Args = {
  command: string;
  repositoryPath?: string;
  baseRef?: string;
  format?: "markdown" | "json";
  validations: string[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = { command: argv[0] ?? "", validations: [] };
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (token === "--repo") {
      args.repositoryPath = argv[++index]?.split(" ")[0];
    } else if (token === "--base-ref") {
      args.baseRef = argv[++index];
    } else if (token === "--format") {
      args.format = argv[++index] as Args["format"];
    } else if (token === "--validate") {
      args.validations.push(argv[++index]);
    }
  }
  return args;
}

export async function runCli(argv: string[], outputDirectory = process.cwd()): Promise<boolean> {
  const args = parseArgs(argv);
  if (args.command !== "review" || !args.repositoryPath) {
    console.error("Usage: inspector review --repo <path> [--base-ref <ref>] [--validate <command>]");
    return false;
  }

  const report = await reviewRepository({
    repositoryPath: args.repositoryPath,
    baseRef: args.baseRef,
    validationCommands: args.validations,
    format: args.format,
  });
  writeFileSync(join(outputDirectory, "review-report.md"), report, "utf8");
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).then((success) => {
    if (success) console.log("Review report written to review-report.md");
    else process.exitCode = 1;
  }).catch((error) => {
    console.error("Fatal error:", error);
    process.exitCode = 1;
  });
}
