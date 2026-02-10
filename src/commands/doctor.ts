import { execFileSync } from "node:child_process";

import type { Command } from "commander";

import { runChecks } from "../checks/runner";
import { FileSystemRepo, findRepoRoot } from "../lib/repo";

interface DoctorOptions {
  format: string;
}

interface DoctorStep {
  name: string;
  status: "pass" | "fail" | "warn";
  detail: string;
}

interface DoctorReport {
  ok: boolean;
  steps: DoctorStep[];
}

export const registerDoctorCommand = (program: Command): void => {
  program
    .command("doctor")
    .description("Diagnose repo health (validate + check + compile + env)")
    .option("--format <format>", "output format (pretty|json)", "pretty")
    .action(async (opts: DoctorOptions) => {
      await runDoctor(opts);
    });
};

async function runDoctor(opts: DoctorOptions): Promise<void> {
  const root = findRepoRoot(process.cwd());
  if (!root) {
    console.error("No company.yaml found. Run `company init` first or cd into a Company-as-Code repo.");
    process.exitCode = 2;
    return;
  }

  const steps: DoctorStep[] = [];

  steps.push(checkNodeVersion());
  steps.push(checkGit(root));
  steps.push(checkGatewayToken());

  const repo = new FileSystemRepo(root);
  steps.push(await runValidateStep(root));
  steps.push(await runCheckStep(repo));
  steps.push(await runCompileStep(root));

  const report: DoctorReport = {
    ok: steps.every((s) => s.status !== "fail"),
    steps,
  };

  if (opts.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else if (opts.format === "pretty") {
    printPretty(report);
  } else {
    console.error(`Unknown format: ${opts.format}`);
    process.exitCode = 1;
    return;
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

function checkNodeVersion(): DoctorStep {
  const major = Number(process.version.match(/^v(\d+)/)?.[1] ?? 0);
  if (major >= 22) {
    return { name: "node", status: "pass", detail: process.version };
  }
  return { name: "node", status: "warn", detail: `${process.version} (>=22 recommended)` };
}

function checkGit(root: string): DoctorStep {
  try {
    execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf-8" });
    return { name: "git", status: "pass", detail: "repo detected" };
  } catch {
    return { name: "git", status: "warn", detail: "not a git repo" };
  }
}

function checkGatewayToken(): DoctorStep {
  if (process.env.OPENCLAW_GATEWAY_TOKEN) {
    return { name: "gateway-token", status: "pass", detail: "OPENCLAW_GATEWAY_TOKEN set" };
  }
  return { name: "gateway-token", status: "warn", detail: "OPENCLAW_GATEWAY_TOKEN not set (needed for sync)" };
}

async function runValidateStep(root: string): Promise<DoctorStep> {
  try {
    execFileSync("node", [process.argv[1], "validate", "--format", "json"], {
      cwd: root,
      encoding: "utf-8",
    });
    return { name: "validate", status: "pass", detail: "structural validation passed" };
  } catch (err) {
    const e = err as { stdout?: string };
    let detail = "structural validation failed";
    try {
      const result = JSON.parse(e.stdout ?? "{}") as { errors?: Array<{ message: string }> };
      if (result.errors && result.errors.length > 0) {
        detail = result.errors.map((e) => e.message).join("; ");
      }
    } catch {
      // keep generic detail
    }
    return { name: "validate", status: "fail", detail };
  }
}

async function runCheckStep(repo: FileSystemRepo): Promise<DoctorStep> {
  try {
    const result = await runChecks({ repo });
    if (result.failed > 0) {
      return { name: "check", status: "fail", detail: `${result.failed} check(s) failed` };
    }
    if (result.warnings > 0) {
      return { name: "check", status: "warn", detail: `${result.passed} passed, ${result.warnings} warning(s)` };
    }
    return { name: "check", status: "pass", detail: `${result.passed} passed` };
  } catch (err) {
    return { name: "check", status: "fail", detail: err instanceof Error ? err.message : "check failed" };
  }
}

async function runCompileStep(root: string): Promise<DoctorStep> {
  try {
    execFileSync("node", [process.argv[1], "sync", "--compile-only"], {
      cwd: root,
      encoding: "utf-8",
    });
    return { name: "compile", status: "pass", detail: "agents compiled successfully" };
  } catch (err) {
    const e = err as { stderr?: string };
    const msg = (e.stderr ?? "").split("\n").filter(Boolean).pop() ?? "compile failed";
    return { name: "compile", status: "fail", detail: msg };
  }
}

function printPretty(report: DoctorReport): void {
  console.log("company doctor\n");
  for (const step of report.steps) {
    const icon = step.status === "pass" ? "OK" : step.status === "warn" ? "WARN" : "FAIL";
    console.log(`  [${icon}] ${step.name}: ${step.detail}`);
  }
  console.log("");
  if (report.ok) {
    console.log("All checks passed.");
  } else {
    console.log("Some checks failed. Fix the issues above.");
  }
}
