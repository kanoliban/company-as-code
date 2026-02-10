import * as fs from "node:fs/promises";
import * as path from "node:path";

import matter from "gray-matter";
import type { Command } from "commander";

import { FileSystemRepo, findRepoRoot } from "../lib/repo";

interface NormalizeOptions {
  dryRun?: boolean;
  normalizeIds?: boolean;
  format: string;
}

interface NormalizeChange {
  file: string;
  changes: string[];
}

interface NormalizeReport {
  scanned: number;
  updated: number;
  dry_run: boolean;
  files: NormalizeChange[];
}

export const registerNormalizeCommand = (program: Command): void => {
  program
    .command("normalize")
    .description("Backfill missing discussion frontmatter")
    .option("--dry-run", "show changes without writing files")
    .option("--normalize-ids", "slugify from/to fields")
    .option("--format <format>", "output format (pretty|json)", "pretty")
    .action(async (opts: NormalizeOptions) => {
      await runNormalize(opts);
    });
};

async function runNormalize(opts: NormalizeOptions): Promise<void> {
  const root = findRepoRoot(process.cwd());
  if (!root) {
    console.error("No company.yaml found. Run `company init` first or cd into a Company-as-Code repo.");
    process.exitCode = 2;
    return;
  }

  const repo = new FileSystemRepo(root);
  const files = await repo.glob("discussion/*-response.md");
  const changes: NormalizeChange[] = [];

  for (const file of files) {
    const raw = await repo.readText(file);
    const parsed = matter(raw);
    const data = (parsed.data ?? {}) as Record<string, unknown>;
    const content = parsed.content;
    const nextData: Record<string, unknown> = { ...data };
    const updates: string[] = [];

    const from = pickString(data.from) ?? extractBodyField(content, "From");
    const to = pickString(data.to) ?? extractBodyField(content, "To");
    const status = pickString(data.status) ?? "delivering";

    const finalFrom = opts.normalizeIds ? normalizeActor(from ?? "unknown") : (from ?? "unknown");
    const finalTo = opts.normalizeIds ? normalizeActor(to ?? "unknown") : (to ?? "unknown");

    if (!hasValue(data.from) || (opts.normalizeIds && pickString(data.from) !== finalFrom)) {
      nextData.from = finalFrom;
      updates.push("from");
    }
    if (!hasValue(data.to) || (opts.normalizeIds && pickString(data.to) !== finalTo)) {
      nextData.to = finalTo;
      updates.push("to");
    }
    if (!hasValue(data.status)) {
      nextData.status = status;
      updates.push("status");
    }

    if (updates.length === 0) continue;

    const updated = matter.stringify(content, nextData);
    const normalized = ensureTrailingNewline(updated, raw);

    changes.push({ file, changes: updates });

    if (!opts.dryRun) {
      const abs = path.join(root, file);
      await fs.writeFile(abs, normalized, "utf-8");
    }
  }

  const report: NormalizeReport = {
    scanned: files.length,
    updated: changes.length,
    dry_run: Boolean(opts.dryRun),
    files: changes,
  };

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

function printPretty(report: NormalizeReport): void {
  const action = report.dry_run ? "would update" : "updated";
  console.log(`normalize: scanned ${report.scanned}, ${action} ${report.updated}`);
  if (report.files.length === 0) return;
  for (const change of report.files) {
    console.log(`- ${change.file} (${change.changes.join(", ")})`);
  }
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}

function extractBodyField(content: string, label: "From" | "To"): string | null {
  const pattern = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, "m");
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

function normalizeActor(value: string): string {
  const trimmed = value.split("(")[0]?.trim() ?? value.trim();
  return slugify(trimmed || value);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

function ensureTrailingNewline(next: string, original: string): string {
  if (original.endsWith("\n") && !next.endsWith("\n")) {
    return `${next}\n`;
  }
  return next;
}
