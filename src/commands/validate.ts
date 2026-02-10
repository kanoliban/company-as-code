import * as path from "node:path";

import type { Command } from "commander";
import { parse as parseYaml } from "yaml";

import { validatePluginManifest } from "../lib/plugins";
import { FileSystemRepo, findRepoRoot } from "../lib/repo";

interface ValidateOptions {
  format: string;
  section: string;
}

interface ValidationError {
  file: string;
  message: string;
}

interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  files_checked: number;
  sections_checked: string[];
}

export const registerValidateCommand = (program: Command): void => {
  program
    .command("validate")
    .description("Validate structural integrity of core repo files")
    .option("--format <format>", "output format (pretty|json)", "pretty")
    .option(
      "--section <section>",
      "section to validate (company|agents|plugins|work-queue|handoff|all)",
      "all",
    )
    .action(async (opts: ValidateOptions) => {
      await runValidate(opts);
    });
};

async function runValidate(opts: ValidateOptions): Promise<void> {
  const root = findRepoRoot(process.cwd());
  if (!root) {
    console.error("No company.yaml found. Run `company init` first or cd into a Company-as-Code repo.");
    process.exitCode = 2;
    return;
  }

  const repo = new FileSystemRepo(root);
  const errors: ValidationError[] = [];
  let filesChecked = 0;

  const section = opts.section ?? "all";
  const sections = resolveSections(section);
  if (!sections) {
    console.error(`Unknown section: ${section}`);
    process.exitCode = 1;
    return;
  }

  if (sections.includes("company")) {
    filesChecked++;
    await validateCompanyYaml(repo, errors);
  }

  if (sections.includes("agents")) {
    filesChecked += await validateAgents(repo, errors);
  }

  if (sections.includes("plugins")) {
    filesChecked += await validatePlugins(repo, errors);
  }

  if (sections.includes("work-queue")) {
    const workQueueFile = "meta/work-queue.yaml";
    if (await repo.exists(workQueueFile)) {
      filesChecked++;
      await validateWorkQueue(repo, errors);
    } else if (section !== "all") {
      filesChecked++;
      errors.push({ file: workQueueFile, message: "file not found" });
    }
  }

  if (sections.includes("handoff")) {
    const handoffFile = "meta/handoff.yaml";
    if (await repo.exists(handoffFile)) {
      filesChecked++;
      await validateHandoffManifest(repo, errors);
    } else if (section !== "all") {
      filesChecked++;
      errors.push({ file: handoffFile, message: "file not found" });
    }
  }

  const result: ValidationResult = {
    ok: errors.length === 0,
    errors,
    files_checked: filesChecked,
    sections_checked: sections,
  };

  if (opts.format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else if (opts.format === "pretty") {
    printPretty(result);
  } else {
    console.error(`Unknown format: ${opts.format}`);
    process.exitCode = 1;
    return;
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

function printPretty(result: ValidationResult): void {
  if (result.ok) {
    console.log(`validate: ${result.files_checked} files checked, 0 errors`);
    return;
  }
  console.log(`validate: ${result.files_checked} files checked, ${result.errors.length} errors\n`);
  for (const err of result.errors) {
    console.log(`  ${err.file}: ${err.message}`);
  }
}

function resolveSections(input: string): string[] | null {
  const section = input.trim().toLowerCase();
  const valid = ["company", "agents", "plugins", "work-queue", "handoff", "all"];
  if (!valid.includes(section)) return null;
  if (section === "all") {
    return ["company", "agents", "plugins", "work-queue", "handoff"];
  }
  return [section];
}

async function validateCompanyYaml(repo: FileSystemRepo, errors: ValidationError[]): Promise<void> {
  const file = "company.yaml";
  let data: Record<string, unknown>;
  try {
    data = await repo.readYaml<Record<string, unknown>>(file);
  } catch {
    errors.push({ file, message: "cannot parse as YAML" });
    return;
  }

  if (typeof data.id !== "string" && typeof data.name !== "string") {
    errors.push({ file, message: "must have id or name" });
  }
  if (typeof data.version !== "string" && typeof data.version !== "number") {
    errors.push({ file, message: "version is required" });
  }
}

async function validateAgents(repo: FileSystemRepo, errors: ValidationError[]): Promise<number> {
  const agentFiles = await repo.glob("agents/*.yaml");
  const REQUIRED_FIELDS = ["id", "name", "mission", "inputs", "outputs"];

  for (const file of agentFiles) {
    let data: Record<string, unknown>;
    try {
      data = await repo.readYaml<Record<string, unknown>>(file);
    } catch {
      errors.push({ file, message: "cannot parse as YAML" });
      continue;
    }

    for (const field of REQUIRED_FIELDS) {
      if (data[field] === undefined || data[field] === null) {
        errors.push({ file, message: `missing required field: ${field}` });
      }
    }

    if (typeof data.id === "string" && typeof data.name === "string") {
      const expectedSlug = data.id;
      const fileName = file.split("/").pop()?.replace(".yaml", "");
      if (fileName && fileName !== expectedSlug) {
        errors.push({ file, message: `filename "${fileName}" does not match id "${expectedSlug}"` });
      }
    }
  }

  return agentFiles.length;
}

async function validatePlugins(repo: FileSystemRepo, errors: ValidationError[]): Promise<number> {
  const pluginFiles = await repo.glob("plugins/*/plugin.yaml");

  for (const file of pluginFiles) {
    let data: unknown;
    try {
      data = await repo.readYaml<unknown>(file);
    } catch {
      errors.push({ file, message: "cannot parse as YAML" });
      continue;
    }

    const folderId = path.posix.basename(path.posix.dirname(file));
    const manifestErrors = validatePluginManifest(data, file, folderId);
    for (const message of manifestErrors) {
      errors.push({ file, message: message.replace(`${file}: `, "") });
    }
  }

  return pluginFiles.length;
}

async function validateWorkQueue(repo: FileSystemRepo, errors: ValidationError[]): Promise<void> {
  const file = "meta/work-queue.yaml";
  let data: Record<string, unknown>;
  try {
    data = await repo.readYaml<Record<string, unknown>>(file);
  } catch {
    errors.push({ file, message: "cannot parse as YAML" });
    return;
  }

  if (!Array.isArray(data.items)) {
    errors.push({ file, message: "items must be an array" });
    return;
  }

  const ids = new Set<string>();
  for (const item of data.items) {
    if (typeof item !== "object" || item === null) {
      errors.push({ file, message: "each item must be an object" });
      continue;
    }
    const obj = item as Record<string, unknown>;
    if (typeof obj.id !== "string" || obj.id.trim() === "") {
      errors.push({ file, message: "each item must have a non-empty id" });
      continue;
    }
    if (ids.has(obj.id)) {
      errors.push({ file, message: `duplicate item id: ${obj.id}` });
    }
    ids.add(obj.id);
  }
}

async function validateHandoffManifest(repo: FileSystemRepo, errors: ValidationError[]): Promise<void> {
  const file = "meta/handoff.yaml";
  let data: Record<string, unknown>;
  try {
    const raw = await repo.readText(file);
    data = parseYaml(raw) as Record<string, unknown>;
  } catch {
    errors.push({ file, message: "cannot parse as YAML" });
    return;
  }

  if (data.version !== undefined && data.version !== 1) {
    errors.push({ file, message: `version must be 1 (got ${data.version})` });
  }

  if (typeof data.source_file !== "string" || data.source_file.trim() === "") {
    errors.push({ file, message: "source_file is required" });
  }

  if (typeof data.from !== "string" || data.from.trim() === "") {
    errors.push({ file, message: "from is required" });
  }

  if (typeof data.to !== "string" || data.to.trim() === "") {
    errors.push({ file, message: "to is required" });
  }
}
