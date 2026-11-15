# Submission

## What did you investigate first, and why?

I first read the README, security/submission instructions, package scripts, shared core, CLI and MCP adapters, Git inspection, validation runner, report generator, and existing tests. This established the advertised contracts and the actual request flow before changing code. I prioritized the MCP schema mismatch and validation trust boundary because they affected whether the documented agent interface worked and whether an MCP caller could cause process execution. I then focused on validation failure/timeout behavior, Git parsing, and report integrity.

## What did you choose to implement or fix?

- Fixed the MCP `repo_path` contract and registered the exact strict Zod object used by the contract tests. MCP is inspection-only; validation commands are not an accepted input.
- Constrained MCP inspection to canonical paths under `INSPECTOR_ALLOWED_REPOS` (default: the server working directory). The discovered Git worktree root must also remain under an allowed root, preventing nested paths from exposing a parent worktree outside that root.
- Replaced shell-based validation execution with direct process spawning. The CLI reports spawn and nonzero-exit failures, captures stdout and stderr up to 64 KiB per command, and applies a 30-second timeout. Timeout handling attempts to terminate the process tree. This is a resource and shell boundary, not a sandbox: a caller-authorized executable can still run code with the CLI user's permissions.
- Changed Git name-status parsing to NUL-delimited output, preserved rename paths as a deletion plus an addition, and rejected base-ref strings beginning with `-` or containing line breaks/NUL.
- Escaped repository paths, changed-file names, and command headings in Markdown; validation output uses a fence longer than any backtick run in the output.
- Fixed CLI repository arguments containing spaces, corrected the package binary path to the build output, and limited Vitest discovery to source tests so `dist/test` does not run as a duplicate suite after a build.
- Added regression tests for MCP schema and root restrictions; CLI/MCP report consistency; Git additions, modifications, deletions, renames, untracked files, empty diffs, unusual branch names and (where supported) unusual filenames; validation outcomes, output bounds, spawn errors, timeout, and Markdown structure.

## What did you intentionally not do?

I did not allow MCP to run validation commands, build a command sandbox, add dependencies, implement JSON reports, or include staged/unstaged/untracked files in the review. CLI validation remains available for explicitly authorized local workflows. The report remains Markdown. I did not change `SECURITY.md` or submit the private GitHub form.

## Interface decision

- Decision: **Hybrid, CLI-first execution; inspection-only MCP.**
- Primary user and execution environment: Developers running the tool locally or in a trusted development/CI shell, with AI agents using a configured local stdio MCP server for read-only repository inspection.
- Trust boundary and allowed capabilities: MCP callers may inspect only repositories whose canonical target and Git worktree root are under configured allowed roots. The default root is the MCP server's current working directory. MCP cannot request validation. CLI validation is an explicit local capability and runs with the invoking user's permissions; direct process spawning avoids shell interpretation but does not isolate the executable.
- Reliability, discoverability, latency/context, and output tradeoffs: The CLI is straightforward for shell users and CI and keeps validation under developer control. MCP makes inspection discoverable to compatible agents and returns the Markdown report directly, but adds server configuration and consumes model context. Git inspection is synchronous. Validation is serial, with a 30-second timeout and a 64 KiB capture limit per command; there is no total report-size limit, so large diffs or many validations can still produce large reports.
- How supported interfaces remain consistent: CLI and MCP share Git inspection and Markdown report generation, and a regression test compares their inspection reports. Their capabilities intentionally differ: only the CLI accepts validation commands, because MCP callers are not trusted to execute arbitrary processes.
- Evidence that would change this decision: If actual usage were almost entirely agent orchestration and validation could run in a separately managed sandbox with explicit authorization, MCP could become the primary interface. If agent use were negligible and CI/local scripts dominated, I would narrow the product to CLI-only.

## How did you use an AI coding agent?

Codex was used to inspect the starter, identify risks, propose and implement focused changes, write regression tests, run verification commands, and review the resulting diff. I treated generated code and tests as hypotheses: I checked the MCP SDK behavior and the actual CLI/MCP execution paths, and used isolated temporary repositories and harmless validation commands to verify observable behavior.

## Where did you check, correct, or reject an AI suggestion? (required)

An initial MCP test wrapped the input shape in a strict Zod object, but the server still registered the raw shape. That test therefore did not prove the actual registered schema was strict. Inspection of the installed MCP SDK showed that raw shapes are normalized to a default object schema. The implementation was corrected to register the strict Zod object itself, and the regression test now uses that same object. A separate validation review also found that `execFile` treated output over its buffer cap as a command failure even when the process exited successfully; streaming capture replaced that behavior, and a regression test verifies oversized stderr from a successful command remains a passed validation with truncation reported.

## Commands used to verify the result, with outcomes

- `npm.cmd run typecheck` — passed (`tsc -p tsconfig.json --noEmit`). The `.cmd` launcher was used because this Windows PowerShell environment blocks `npm.ps1` under its execution policy.
- `npm.cmd test` — passed: 4 source test files, 17 passed, 1 skipped. The skipped test exercises descendant-process termination when a descendant inherits output pipes; it is skipped on Windows.
- `npm.cmd run build` — passed.
- Built CLI smoke check — passed using `node dist/src/cli.js` against a temporary repository path containing spaces.
- Temporary MCP stdio end-to-end harness using the MCP SDK client and built server — passed: valid request returned the same report as the CLI; the registered schema exposed only `repo_path` and `baseRef` with additional properties disabled; validation-command injection and a repository outside configured roots were rejected. The temporary harness was removed after execution.
- `git diff --check` — passed.
- Manual verification performed by the candidate and reported for this assessment:

  ```text
  npm run build
  node .\dist\src\cli.js review --repo . --base-ref HEAD --validate "npm --version"
  Get-Content .\review-report.md
  ```

  The build succeeded, the CLI generated `review-report.md`, and the report recorded `npm --version` as passed with the installed npm version. This confirms a successful CLI review invocation, successful validation command, and readable Markdown output. It does not prove all MCP behavior, production security, or validation failure paths.

## A blocker you hit and how you approached it

PowerShell initially blocked the `npm` PowerShell shim because script execution was disabled. I used `npm.cmd` for automated verification instead. A direct `tsx` subprocess probe also failed before project code ran with `uv_os_get_passwd returned ENOMEM`; CLI adapter tests were made callable without that subprocess startup path, and a later built-CLI smoke check plus a separate built MCP stdio test verified the executable interfaces.

## Known limitations and the next three things you would do

Verified limitations:

- CLI validation is not sandboxed and must only run commands explicitly trusted by the local caller.
- MCP access is limited by `INSPECTOR_ALLOWED_REPOS` (or the current working directory by default); deployments must configure and protect this boundary.
- Output is capped per validation, not across the complete report. Git name-status execution is synchronous and uses Node's default `execFileSync` output buffer, so very large change sets can fail or produce costly reports.
- Git inspection compares committed changes from `<base-ref>...HEAD` and ignores staged, unstaged, and untracked files. The default base is `main`; another base must be supplied explicitly.
- `--format json` is still accepted by the CLI argument parser and the request type, but the implementation always returns Markdown. This contract should be corrected before relying on JSON consumers.
- The Windows direct-process timeout path was exercised, but the descendant-process timeout test is skipped on Windows; process-tree termination through `taskkill` was not independently verified.
- Git errors such as a missing default base propagate as inspector errors. Automatic default-branch discovery is not implemented.

Next three improvements:

1. Resolve the format contract by implementing JSON end to end or rejecting/removing the unsupported JSON option, and validate all CLI arguments.
2. Define a total report/file-count limit with explicit truncation metadata, and bound Git subprocess duration/output without blocking the MCP event loop.
3. Verify Windows process-tree termination and add automated cross-platform coverage for Git edge cases and MCP server startup/configuration.

## Approximate focused-work time

- Start: **[complete from your own time record; not recorded in this session]**
- Finish: **[complete from your own time record; not recorded in this session]**
