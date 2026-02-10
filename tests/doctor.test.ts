import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const CLI = path.resolve(__dirname, "../dist/cli.js");

function run(root: string, args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("node", [CLI, ...args], { cwd: root, encoding: "utf-8" });
    return { stdout, status: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

async function setupRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "company-doctor-"));
  await fs.mkdir(path.join(root, "meta"), { recursive: true });
  await fs.mkdir(path.join(root, "agents"), { recursive: true });
  await fs.writeFile(
    path.join(root, "company.yaml"),
    "id: test\nname: Test\nversion: 0.1.0\n",
    "utf-8",
  );
  await fs.writeFile(
    path.join(root, "agents/example.yaml"),
    [
      "id: example",
      "name: Example",
      "role: test",
      "level: lead",
      "mission: Test agent",
      "inputs:",
      "  authoritative: []",
      "  reads: []",
      "outputs:",
      "  - type: code",
      "    cadence: per-task",
      "    destination: src/",
      "writes:",
      "  allowed: [src/**]",
      "  forbidden: [canon/**]",
      "forbidden:",
      "  - Deleting tests",
      "escalation:",
      "  triggers:",
      "    - Spec ambiguity",
      "  to: ops",
      "heartbeat:",
      "  schedule: '30 9 * * 1-5'",
      "  session_type: isolated",
      "  checklist:",
      "    - Check tasks",
      "model:",
      "  default: claude-opus-4-6",
      "  thinking: high",
      "tools:",
      "  profile: standard",
      "  allowed: [shell, file_read]",
      "  forbidden: [deploy]",
      "",
    ].join("\n"),
    "utf-8",
  );
  return root;
}

describe("company doctor", () => {
  it("runs all steps and outputs pretty summary", async () => {
    const root = await setupRepo();
    const { stdout } = run(root, ["doctor"]);
    expect(stdout).toContain("company doctor");
    expect(stdout).toContain("node:");
    expect(stdout).toContain("validate:");
    expect(stdout).toContain("check:");
    expect(stdout).toContain("compile:");
  });

  it("outputs JSON report", async () => {
    const root = await setupRepo();
    const { stdout } = run(root, ["doctor", "--format", "json"]);
    const report = JSON.parse(stdout) as { ok: boolean; steps: Array<{ name: string; status: string }> };
    expect(report).toHaveProperty("ok");
    expect(report).toHaveProperty("steps");
    expect(report.steps.length).toBeGreaterThanOrEqual(5);
    const stepNames = report.steps.map((s) => s.name);
    expect(stepNames).toContain("node");
    expect(stepNames).toContain("validate");
    expect(stepNames).toContain("check");
    expect(stepNames).toContain("compile");
  });

  it("detects missing company.yaml version", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "company-doctor-"));
    await fs.writeFile(path.join(root, "company.yaml"), "id: test\nname: Test\n", "utf-8");
    const { stdout, status } = run(root, ["doctor", "--format", "json"]);
    expect(status).toBe(1);
    const report = JSON.parse(stdout) as { ok: boolean; steps: Array<{ name: string; status: string }> };
    expect(report.ok).toBe(false);
    const validateStep = report.steps.find((s) => s.name === "validate");
    expect(validateStep?.status).toBe("fail");
  });
});
