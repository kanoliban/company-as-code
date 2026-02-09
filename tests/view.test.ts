import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const CLI = path.resolve(__dirname, "../dist/cli.js");
const CWD = path.resolve(__dirname, "..");

function run(args: string[]): string {
  return execFileSync("node", [CLI, ...args], { cwd: CWD, encoding: "utf-8" });
}

describe("company view", () => {
  it("renders all sections by default", () => {
    const output = run(["view"]);
    expect(output).toContain("Objectives");
    expect(output).toContain("Risks");
    expect(output).toContain("Pipeline");
    expect(output).toContain("Work Queue");
  });

  it("filters to a single section", () => {
    const output = run(["view", "--section", "risks"]);
    expect(output).toContain("Risks");
    expect(output).not.toContain("Objectives");
    expect(output).not.toContain("Pipeline");
  });

  it("shows risk severity", () => {
    const output = run(["view", "--section", "risks"]);
    expect(output).toContain("[medium]");
  });

  it("shows owner in parentheses", () => {
    const output = run(["view", "--section", "objectives"]);
    expect(output).toMatch(/\(codex\)/);
  });

  it("outputs valid JSON with --format json", () => {
    const output = run(["view", "--format", "json"]);
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("objectives");
    expect(parsed).toHaveProperty("risks");
    expect(parsed).toHaveProperty("pipeline");
    expect(parsed).toHaveProperty("work-queue");
    expect(Array.isArray(parsed.objectives)).toBe(true);
  });

  it("outputs filtered JSON for a single section", () => {
    const output = run(["view", "--section", "pipeline", "--format", "json"]);
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("pipeline");
    expect(parsed).not.toHaveProperty("risks");
  });

  it("includes item fields in JSON output", () => {
    const output = run(["view", "--section", "risks", "--format", "json"]);
    const parsed = JSON.parse(output);
    const item = parsed.risks[0];
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("title");
    expect(item).toHaveProperty("owner");
    expect(item).toHaveProperty("status");
    expect(item).toHaveProperty("severity");
  });
});
