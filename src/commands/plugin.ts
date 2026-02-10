import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { Command } from "commander";

import { FileSystemRepo, findRepoRoot } from "../lib/repo";
import { PluginCommandSpec, PluginManifest, isSafeRelativePath, validatePluginManifest } from "../lib/plugins";

interface PluginEntry {
  manifest: PluginManifest;
  file: string;
  dir: string;
}

interface PluginListResult {
  plugins: PluginEntry[];
  errors: string[];
}

interface PluginListOptions {
  format: string;
}

interface PluginRunOptions {
  command?: string;
  dryRun?: boolean;
}

interface PluginInitOptions {
  name?: string;
  description?: string;
  force?: boolean;
}

export const registerPluginCommand = (program: Command): void => {
  const plugin = program
    .command("plugin")
    .description("Manage repo-local plugins")
    .enablePositionalOptions();

  plugin
    .command("list")
    .description("List installed plugins")
    .option("--format <format>", "output format (pretty|json)", "pretty")
    .action(async (opts: PluginListOptions) => {
      await runPluginList(opts);
    });

  plugin
    .command("run <plugin>")
    .description("Run a plugin command")
    .option("--command <name>", "command name to run", "default")
    .option("--dry-run", "print resolved command without executing")
    .passThroughOptions()
    .argument("[args...]", "arguments for the plugin command")
    .action(async (pluginId: string, args: string[], opts: PluginRunOptions) => {
      await runPlugin(pluginId, args, opts);
    });

  plugin
    .command("init <id>")
    .description("Scaffold a new plugin manifest")
    .option("--name <name>", "display name for the plugin")
    .option("--description <description>", "short plugin description")
    .option("--force", "overwrite existing plugin manifest")
    .action(async (id: string, opts: PluginInitOptions) => {
      await runPluginInit(id, opts);
    });
};

async function runPluginList(opts: PluginListOptions): Promise<void> {
  const root = findRepoRoot(process.cwd());
  if (!root) {
    console.error("No company.yaml found. Run `company init` first or cd into a Company-as-Code repo.");
    process.exitCode = 2;
    return;
  }

  const repo = new FileSystemRepo(root);
  const { plugins, errors } = await loadPlugins(repo);

  if (opts.format === "json") {
    console.log(JSON.stringify({ plugins: plugins.map((p) => p.manifest), errors }, null, 2));
  } else if (opts.format === "pretty") {
    if (plugins.length === 0) {
      console.log("No plugins found.");
    } else {
      console.log("Plugins:");
      for (const plugin of plugins) {
        const manifest = plugin.manifest;
        const desc = manifest.description ? ` — ${manifest.description}` : "";
        const commands = Object.keys(manifest.commands ?? {}).join(", ");
        console.log(`- ${manifest.id}${desc}`);
        console.log(`  commands: ${commands || "(none)"}`);
      }
    }
    if (errors.length > 0) {
      for (const err of errors) {
        console.error(err);
      }
    }
  } else {
    console.error(`Unknown format: ${opts.format}`);
    process.exitCode = 1;
    return;
  }

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

async function runPlugin(pluginId: string, args: string[], opts: PluginRunOptions): Promise<void> {
  const root = findRepoRoot(process.cwd());
  if (!root) {
    console.error("No company.yaml found. Run `company init` first or cd into a Company-as-Code repo.");
    process.exitCode = 2;
    return;
  }

  const repo = new FileSystemRepo(root);
  const { plugins, errors } = await loadPlugins(repo);
  if (errors.length > 0) {
    for (const err of errors) console.error(err);
    process.exitCode = 1;
    return;
  }

  const plugin = plugins.find((p) => p.manifest.id === pluginId);
  if (!plugin) {
    console.error(`Plugin "${pluginId}" not found.`);
    process.exitCode = 1;
    return;
  }

  const commandName = opts.command ?? "default";
  const command = plugin.manifest.commands?.[commandName];
  if (!command) {
    console.error(`Plugin "${pluginId}" does not define command "${commandName}".`);
    process.exitCode = 1;
    return;
  }

  const resolved = resolveCommand(root, command);
  if (!resolved.ok) {
    for (const err of resolved.errors) console.error(err);
    process.exitCode = 1;
    return;
  }

  const finalArgs = [...resolved.args, ...(args ?? [])];
  if (opts.dryRun) {
    console.log(
      JSON.stringify(
        {
          cmd: resolved.cmd,
          args: finalArgs,
          cwd: resolved.cwd,
        },
        null,
        2,
      ),
    );
    return;
  }
  const result = spawnSync(resolved.cmd, finalArgs, {
    cwd: resolved.cwd,
    stdio: "inherit",
    env: process.env,
  });

  if (typeof result.status === "number" && result.status !== 0) {
    process.exitCode = result.status;
  } else if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
  }
}

async function loadPlugins(repo: FileSystemRepo): Promise<PluginListResult> {
  const files = await repo.glob("plugins/*/plugin.yaml");
  const plugins: PluginEntry[] = [];
  const errors: string[] = [];

  for (const file of files) {
    let manifest: unknown;
    try {
      manifest = await repo.readYaml<unknown>(file);
    } catch (err) {
      errors.push(`${file}: failed to parse YAML (${err instanceof Error ? err.message : String(err)})`);
      continue;
    }

    const dir = path.posix.dirname(file);
    const folderId = path.posix.basename(dir);
    const manifestErrors = validatePluginManifest(manifest, file, folderId);
    if (manifestErrors.length > 0) {
      errors.push(...manifestErrors);
      continue;
    }

    plugins.push({ manifest: manifest as PluginManifest, file, dir });
  }

  return { plugins, errors };
}

function resolveCommand(
  root: string,
  spec: PluginCommandSpec,
): { ok: true; cmd: string; args: string[]; cwd: string } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const cmd = spec.cmd.trim();
  if (!cmd) errors.push("plugin command: cmd is required");
  if (path.isAbsolute(cmd) || cmd.startsWith("~")) {
    errors.push("plugin command: cmd must be a relative path or executable name");
  }

  let resolvedCmd = cmd;
  if (cmd.includes("/") || cmd.includes("\\")) {
    if (!isSafeRelativePath(cmd)) {
      errors.push("plugin command: cmd must be a safe relative path");
    } else {
      resolvedCmd = path.join(root, cmd);
    }
  }

  let cwd = root;
  if (spec.cwd) {
    if (!isSafeRelativePath(spec.cwd)) {
      errors.push("plugin command: cwd must be a safe relative path");
    } else {
      cwd = path.join(root, spec.cwd);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const args = Array.isArray(spec.args) ? spec.args : [];
  return { ok: true, cmd: resolvedCmd, args, cwd };
}

async function runPluginInit(id: string, opts: PluginInitOptions): Promise<void> {
  const root = findRepoRoot(process.cwd());
  if (!root) {
    console.error("No company.yaml found. Run `company init` first or cd into a Company-as-Code repo.");
    process.exitCode = 2;
    return;
  }

  const slug = slugify(id);
  if (!slug) {
    console.error("Plugin id must contain at least one alphanumeric character.");
    process.exitCode = 1;
    return;
  }

  const pluginDir = path.join(root, "plugins", slug);
  const manifestPath = path.join(pluginDir, "plugin.yaml");

  if (!opts.force && (await exists(manifestPath))) {
    console.error(`Refusing to overwrite existing plugin manifest: plugins/${slug}/plugin.yaml`);
    process.exitCode = 1;
    return;
  }

  await fs.mkdir(pluginDir, { recursive: true });

  const name = opts.name ?? titleFromId(slug);
  const content = buildPluginManifest(slug, name, opts.description);
  await fs.writeFile(manifestPath, content, "utf-8");

  console.log(`Initialized plugin at plugins/${slug}/plugin.yaml`);
}

function buildPluginManifest(id: string, name: string, description?: string): string {
  const lines: string[] = [];
  lines.push(`id: ${id}`);
  lines.push(`name: ${name}`);
  if (description && description.trim() !== "") {
    lines.push(`description: ${description}`);
  }
  lines.push("commands:");
  lines.push("  default:");
  lines.push("    cmd: node");
  lines.push("    args:");
  lines.push('      - "-e"');
  lines.push(`      - "console.log('plugin ${id} ready')"`);
  lines.push("");
  return lines.join("\n");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleFromId(value: string): string {
  return value
    .split(/[-_]+/g)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
