import type { ChangedFile, ValidationResult } from "./types.js";

type ReportInput = {
  repositoryPath: string;
  changedFiles: ChangedFile[];
  validationResults: ValidationResult[];
};

function inlineText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/([`*_{}\[\]()#+.!|])/g, "\\$1");
}

function fenceFor(value: string): string {
  const runs = value.match(/`+/g) ?? [];
  return "`".repeat(Math.max(3, ...runs.map((run) => run.length + 1)));
}

export function markdownReport(input: ReportInput): string {
  const lines = [`# Review Report: ${inlineText(input.repositoryPath)}`, "", "## Changed files"];
  for (const file of input.changedFiles) {
    lines.push(`- ${inlineText(file.path)} (${file.status})`);
  }
  lines.push("", "## Validation output");
  for (const result of input.validationResults) {
    const fence = fenceFor(result.output);
    lines.push(`### ${inlineText(result.command)} — ${result.status}`, `${fence}text`, result.output, fence);
  }
  return lines.join("\n");
}
