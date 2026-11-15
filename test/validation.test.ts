import { describe, expect, it } from "vitest";
import { runValidation } from "../src/validation.js";

describe("runValidation", () => {
  it("captures passed and failed exit outcomes", async () => {
    const node = `"${process.execPath}"`;
    const ok = await runValidation(`${node} -e "process.stdout.write('ok')"`, process.cwd());
    const failed = await runValidation(`${node} -e "process.stderr.write('bad'); process.exit(2)"`, process.cwd());
    expect(ok).toMatchObject({ status: "passed", output: "ok" });
    expect(failed.status).toBe("failed");
    expect(failed.output).toContain("bad");
  });

  it("reports shell syntax as a validation failure", async () => {
    const result = await runValidation("echo safe && whoami", process.cwd());
    expect(result.status).toBe("failed");
    expect(result.output).toContain("Shell operators");
  });

  it("captures spawn errors and empty executables as validation failures", async () => {
    const missing = await runValidation("inspector-command-that-does-not-exist", process.cwd());
    const empty = await runValidation('""', process.cwd());
    expect(missing.status).toBe("failed");
    expect(missing.output).toContain("Execution failed");
    expect(empty.status).toBe("failed");
    expect(empty.output).toContain("must not be empty");
  });

  it.skipIf(process.platform !== "win32")("runs npm without invoking a shell on Windows", async () => {
    const result = await runValidation("npm --version", process.cwd());
    expect(result.status).toBe("passed");
    expect(result.output).toMatch(/\d+\.\d+\.\d+/);
  });

  it("bounds output and reports timeout", async () => {
    const node = `"${process.execPath}"`;
    const large = await runValidation(`${node} -e "process.stdout.write('x'.repeat(10000))"`, process.cwd(), { maxOutputBytes: 128 });
    const slow = await runValidation(`${node} -e "setTimeout(() => {}, 10000)"`, process.cwd(), { timeoutMs: 100 });
    expect(large.output).toContain("output truncated at 128 bytes");
    expect(large.output.length).toBeLessThan(200);
    expect(slow.status).toBe("failed");
    expect(slow.output).toContain("Timed out");
  });

  it("bounds excessive stderr as well as stdout", async () => {
    const node = `"${process.execPath}"`;
    const result = await runValidation(`${node} -e "process.stderr.write('e'.repeat(10000))"`, process.cwd(), { maxOutputBytes: 128 });
    expect(result.status).toBe("passed");
    expect(result.output).toContain("output truncated at 128 bytes");
    expect(Buffer.byteLength(result.output)).toBeLessThan(200);
  });

  it.skipIf(process.platform === "win32")("returns on timeout when a descendant inherits the output pipes", async () => {
    const node = `"${process.execPath}"`;
    const code = `require('child_process').spawn(process.execPath, ['-e', 'setTimeout(()=>{},10000)'], {stdio:['ignore','inherit','inherit']}); setTimeout(()=>{},10000)`;
    const started = Date.now();
    const result = await runValidation(`${node} -e "${code}"`, process.cwd(), { timeoutMs: 150 });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.status).toBe("failed");
    expect(result.output).toContain("Timed out");
  });
});
