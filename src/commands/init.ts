import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { Command } from "commander";

interface InitOptions {
  name?: string;
  owner?: string;
  dir: string;
  force?: boolean;
  samples: boolean;
}

interface InitFile {
  path: string;
  content: string;
}

export const registerInitCommand = (program: Command): void => {
  program
    .command("init")
    .description("Scaffold a new Company-as-Code repo")
    .option("--name <name>", "company name")
    .option("--owner <owner>", "primary owner")
    .option("--dir <path>", "target directory", ".")
    .option("--force", "overwrite existing files")
    .option("--no-samples", "omit sample content")
    .action(async (opts: InitOptions) => {
      await runInit(opts);
    });
};

async function runInit(opts: InitOptions): Promise<void> {
  const targetDir = path.resolve(opts.dir);
  const name = opts.name ?? path.basename(targetDir);
  const owner = opts.owner ?? process.env.USER ?? "owner";
  const id = slugify(name);

  const dirs = [
    "state",
    "meta",
    "canon",
    "decisions",
    "agents",
    "interfaces",
    "artifacts",
    "reports",
    "checks",
  ];

  const files: InitFile[] = [];

  files.push({
    path: "company.yaml",
    content: buildCompanyYaml(id, name, owner),
  });

  if (opts.samples) {
    files.push({
      path: "state/objectives.yaml",
      content: buildSampleObjectives(owner),
    });
    files.push({
      path: "meta/work-queue.yaml",
      content: buildSampleWorkQueue(owner),
    });
  }

  files.push({
    path: ".gitignore",
    content: ["node_modules", "dist", ".compiled", ".env*"].join("\n") + "\n",
  });

  if (opts.samples) {
    files.push({
      path: "README.md",
      content: buildSampleReadme(name),
    });
  }

  for (const dir of dirs) {
    files.push({
      path: path.join(dir, ".gitkeep"),
      content: "",
    });
  }

  await fs.mkdir(targetDir, { recursive: true });

  const conflicts = await findConflicts(targetDir, files);
  if (conflicts.length > 0 && !opts.force) {
    console.error("Refusing to overwrite existing files:");
    for (const conflict of conflicts) {
      console.error(`  - ${conflict}`);
    }
    process.exitCode = 1;
    return;
  }

  await Promise.all(dirs.map((dir) => fs.mkdir(path.join(targetDir, dir), { recursive: true })));

  for (const file of files) {
    const abs = path.join(targetDir, file.path);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    if (!opts.force && (await exists(abs))) continue;
    await fs.writeFile(abs, file.content, "utf-8");
  }

  console.log(`Initialized Company-as-Code repo in ${targetDir}`);
}

async function findConflicts(targetDir: string, files: InitFile[]): Promise<string[]> {
  const conflicts: string[] = [];
  for (const file of files) {
    const abs = path.join(targetDir, file.path);
    if (await exists(abs)) {
      conflicts.push(file.path);
    }
  }
  return conflicts;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildCompanyYaml(id: string, name: string, owner: string): string {
  return [
    `id: ${id}`,
    `name: ${name}`,
    "owners:",
    `  - ${owner}`,
    "version: 0.1.0",
    "scope:",
    "  modeled_domains: []",
    "limits:",
    "  max_state_items_per_file: 50",
    "  max_open_risks: 20",
    "  max_objectives: 7",
    "autonomy:",
    "  level: 0",
    "defaults:",
    "  date_format: YYYY-MM-DD",
    "  gateway_ws: ws://127.0.0.1:18789",
    "",
  ].join("\n");
}

function buildSampleObjectives(owner: string): string {
  const today = new Date();
  const asOf = formatDate(today);
  const reviewBy = formatDate(addDays(today, 7));

  return [
    "items:",
    "  - id: getting-started",
    "    title: Complete initial Company-as-Code setup",
    `    owner: ${owner}`,
    "    status: active",
    `    as_of: ${asOf}`,
    `    review_by: ${reviewBy}`,
    "    summary: Initialize repo, run check, and validate sync compile-only",
    "",
  ].join("\n");
}

function buildSampleWorkQueue(owner: string): string {
  return [
    "items:",
    "  - id: init-repo",
    "    title: Initialize Company-as-Code repo",
    `    owner: ${owner}`,
    "    status: ready",
    "    depends_on: []",
    "    deliverables:",
    "      - company.yaml",
    "    next_action: Run company check and company sync --compile-only",
    "    review_by: TBD",
    "",
  ].join("\n");
}

function buildSampleReadme(name: string): string {
  return [
    `# ${name}`,
    "",
    "Quickstart:",
    "",
    "```bash",
    "company check",
    "company sync --compile-only",
    "```",
    "",
  ].join("\n");
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
