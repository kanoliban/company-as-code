import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const CLI = path.resolve(__dirname, "../dist/cli.js");
const CWD = path.resolve(__dirname, "..");

function run(args: string[]): string {
  return execFileSync("node", [CLI, ...args], { cwd: CWD, encoding: "utf-8" });
}

describe("company status", () => {
  it("renders summary sections", () => {
    const output = run(["status"]);
    expect(output).toContain("Handoff");
    expect(output).toContain("Work Queue");
    expect(output).toContain("Checks");
  });

  it("outputs valid JSON with --format json", () => {
    const output = run(["status", "--format", "json"]);
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("handoff");
    expect(parsed).toHaveProperty("work_queue");
    expect(parsed).toHaveProperty("checks");
  });
});
