import * as path from "node:path";

export interface PluginCommandSpec {
  cmd: string;
  args?: string[];
  cwd?: string;
}

export interface PluginManifest {
  id: string;
  name?: string;
  description?: string;
  engine?: string;
  commands: Record<string, PluginCommandSpec>;
}

export function validatePluginManifest(manifest: unknown, file: string, folderId: string): string[] {
  const errors: string[] = [];

  if (!manifest || typeof manifest !== "object") {
    return [`${file}: manifest must be an object`];
  }

  const data = manifest as Record<string, unknown>;

  if (typeof data.id !== "string" || data.id.trim() === "") {
    errors.push(`${file}: missing required field "id"`);
  } else if (data.id !== folderId) {
    errors.push(`${file}: id "${data.id}" does not match folder "${folderId}"`);
  }

  if (!data.commands || typeof data.commands !== "object") {
    errors.push(`${file}: missing required field "commands"`);
  } else {
    const commandEntries = Object.entries(data.commands as Record<string, unknown>);
    if (commandEntries.length === 0) {
      errors.push(`${file}: commands must define at least one command`);
    }
    for (const [name, spec] of commandEntries) {
      if (!spec || typeof spec !== "object") {
        errors.push(`${file}: command "${name}" must be an object`);
        continue;
      }
      const commandSpec = spec as PluginCommandSpec;
      if (typeof commandSpec.cmd !== "string" || !commandSpec.cmd.trim()) {
        errors.push(`${file}: command "${name}" missing cmd`);
      }
      const args = commandSpec.args;
      if (args && (!Array.isArray(args) || args.some((arg) => typeof arg !== "string"))) {
        errors.push(`${file}: command "${name}" args must be string[]`);
      }
      const cwd = commandSpec.cwd;
      if (cwd && typeof cwd !== "string") {
        errors.push(`${file}: command "${name}" cwd must be a string`);
      }
      if (cwd && !isSafeRelativePath(cwd)) {
        errors.push(`${file}: command "${name}" cwd must be a safe relative path`);
      }
    }
  }

  return errors;
}

export function isSafeRelativePath(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  if (path.isAbsolute(value)) return false;
  if (value.startsWith("~")) return false;
  const normalized = path.posix.normalize(value.split(path.sep).join("/"));
  if (normalized.startsWith("../") || normalized === "..") return false;
  if (normalized.includes("/../")) return false;
  return true;
}
