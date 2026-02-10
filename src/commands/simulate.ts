import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { Command } from "commander";

import type { HandoffManifest } from "../lib/handoff";
import { validateHandoffManifest } from "../lib/handoff";
import { FileSystemRepo, findRepoRoot } from "../lib/repo";

interface SimulateOptions {
  format: string;
}

interface SimulationReport {
  source_file: string;
  from: string | null;
  to: string | null;
  manifest_valid: boolean;
  validation_warnings: string[];
  validation_errors: string[];
  source_text_length: number;
  would_create_stub: string | null;
  simulated_at: string;
  manifest: HandoffManifest;
}

export const registerSimulateCommand = (program: Command): void => {
  program
    .command("simulate")
    .description("Simulate a handoff without side effects (writes report only)")
    .option("--format <format>", "output format (pretty|json)", "pretty")
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ company simulate",
        "  $ company simulate --format json",
      ].join("\n"),
    )
    .action(async (opts: SimulateOptions) => {
      await runSimulate(opts);
    });
};

async function runSimulate(opts: SimulateOptions): Promise<void> {
  const root = findRepoRoot(process.cwd());
  if (!root) {
    console.error("No company.yaml found. Run `company init` first or cd into a Company-as-Code repo.");
    process.exitCode = 2;
    return;
  }

  const repo = new FileSystemRepo(root);
  const latest = await findLatestDiscussion(repo);
  if (!latest) {
    console.error("No discussion/*-response.md files found.");
    process.exitCode = 1;
    return;
  }

  const { file, number } = latest;
  const sourceText = await repo.readText(file);
  const { data, content } = await repo.readFrontmatter(file);

  const fromField = pickString(data.from) ?? extractBodyField(content, "From");
  const toField = pickString(data.to) ?? extractBodyField(content, "To") ?? "Claude";

  const fromId = fromField ? slugify(fromField) : "";
  const toId = toField ? slugify(toField) : "";

  const manifest: HandoffManifest = {
    version: 1,
    source_file: file,
    generated_at: new Date().toISOString().slice(0, 10),
    status: "pending",
    work_queue_items: normalizeList(data.work_queue_item),
    files_changed: normalizeList(data.files_changed),
  };

  if (fromId) manifest.from = fromId;
  if (toId) manifest.to = toId;

  const validation = await validateHandoffManifest(manifest, repo);
  const stubPath = toId ? buildStubPath(number + 1, toId) : null;

  const report: SimulationReport = {
    source_file: file,
    from: fromId || null,
    to: toId || null,
    manifest_valid: validation.ok,
    validation_warnings: validation.warnings,
    validation_errors: validation.errors,
    source_text_length: sourceText.length,
    would_create_stub: stubPath,
    simulated_at: new Date().toISOString(),
    manifest,
  };

  await writeReport(root, report);

  if (opts.format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (opts.format !== "pretty") {
    console.error(`Unknown format: ${opts.format}`);
    process.exitCode = 1;
    return;
  }

  printPretty(report);
}

async function findLatestDiscussion(repo: FileSystemRepo): Promise<{ file: string; number: number } | null> {
  const files = await repo.glob("discussion/*-response.md");
  let latestFile = "";
  let latestNum = -1;
  for (const file of files) {
    const match = file.match(/^discussion\/(\d{3})-.*-response\.md$/);
    if (!match) continue;
    const num = Number(match[1]);
    if (Number.isFinite(num) && num > latestNum) {
      latestNum = num;
      latestFile = file;
    }
  }
  if (!latestFile) return null;
  return { file: latestFile, number: latestNum };
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractBodyField(content: string, label: "From" | "To"): string | null {
  const pattern = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, "m");
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }
  return [];
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

function buildStubPath(nextNumber: number, toId: string): string {
  return `discussion/${String(nextNumber).padStart(3, "0")}-${toId}-response.md`;
}

async function writeReport(root: string, report: SimulationReport): Promise<void> {
  const reportDir = path.join(root, "reports");
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "simulation.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");
}

function printPretty(report: SimulationReport): void {
  console.log("company simulate");
  console.log(`source: ${report.source_file}`);
  console.log(`from: ${report.from ?? "-"}`);
  console.log(`to: ${report.to ?? "-"}`);
  console.log(`manifest_valid: ${report.manifest_valid}`);
  console.log(`warnings: ${report.validation_warnings.length}`);
  console.log(`errors: ${report.validation_errors.length}`);
  console.log(`would_create_stub: ${report.would_create_stub ?? "-"}`);
  console.log("report: reports/simulation.json");
}
