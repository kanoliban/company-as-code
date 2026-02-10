import * as fs from "node:fs/promises";
import * as path from "node:path";

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import type { Repo } from "./repo";

export interface HandoffManifest {
  version?: number;
  source_file?: string;
  generated_at?: string;
  from?: string;
  to?: string;
  branch?: string;
  work_queue_items?: string[];
  files_changed?: string[];
  status?: "pending" | "sent" | "failed" | string;
  sent_at?: string | null;
  session_key?: string | null;
}

export interface HandoffValidationResult {
  ok: boolean;
  legacy: boolean;
  errors: string[];
  warnings: string[];
}

const SOURCE_FILE_PATTERN = /^discussion\/\d{3}-.*-response\.md$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_VALUES = new Set(["pending", "sent", "failed"]);

export async function validateHandoffManifest(
  manifest: HandoffManifest,
  repo: Repo,
): Promise<HandoffValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (manifest.version === undefined || manifest.version === null) {
    warnings.push("legacy handoff manifest detected (missing version); skipping validation");
    return { ok: true, legacy: true, errors, warnings };
  }

  if (manifest.version !== 1) {
    errors.push(`version must be 1 (got ${manifest.version})`);
  }

  if (!isNonEmptyString(manifest.source_file)) {
    errors.push("source_file is required");
  } else if (!SOURCE_FILE_PATTERN.test(manifest.source_file)) {
    errors.push("source_file must match discussion/NNN-*-response.md");
  }

  if (!isNonEmptyString(manifest.generated_at)) {
    errors.push("generated_at is required");
  } else if (!ISO_DATE_PATTERN.test(manifest.generated_at)) {
    errors.push("generated_at must be an ISO date (YYYY-MM-DD)");
  }

  if (!isNonEmptyString(manifest.from)) {
    errors.push("from is required");
  }

  if (!isNonEmptyString(manifest.to)) {
    errors.push("to is required");
  }

  if (isNonEmptyString(manifest.from) && isNonEmptyString(manifest.to) && manifest.from === manifest.to) {
    errors.push("from and to must be different");
  }

  if (!isNonEmptyString(manifest.status)) {
    errors.push("status is required");
  } else if (!STATUS_VALUES.has(manifest.status)) {
    errors.push(`status must be one of: ${Array.from(STATUS_VALUES).join(", ")}`);
  }

  if (errors.length > 0) {
    return { ok: false, legacy: false, errors, warnings };
  }

  await runContextualChecks(manifest, repo, warnings);

  return { ok: true, legacy: false, errors, warnings };
}

async function runContextualChecks(
  manifest: HandoffManifest,
  repo: Repo,
  warnings: string[],
): Promise<void> {
  if (isNonEmptyString(manifest.source_file)) {
    const exists = await repo.exists(manifest.source_file);
    if (!exists) warnings.push(`source_file does not exist: ${manifest.source_file}`);
  }

  const participants = await readParticipantIds(repo);
  if (participants.length > 0) {
    if (isNonEmptyString(manifest.from) && !participants.includes(manifest.from)) {
      warnings.push(`from agent not found in collaboration.yaml: ${manifest.from}`);
    }
    if (isNonEmptyString(manifest.to) && !participants.includes(manifest.to)) {
      warnings.push(`to agent not found in collaboration.yaml: ${manifest.to}`);
    }
  }

  if (Array.isArray(manifest.work_queue_items) && manifest.work_queue_items.length > 0) {
    const validIds = await readWorkQueueIds(repo);
    if (validIds.length > 0) {
      for (const id of manifest.work_queue_items) {
        if (!validIds.includes(id)) warnings.push(`work_queue_item not found: ${id}`);
      }
    }
  }

  if (Array.isArray(manifest.files_changed)) {
    for (const file of manifest.files_changed) {
      if (!isSafeRelativePath(file)) {
        warnings.push(`files_changed entry is not a safe relative path: ${file}`);
      }
    }
  }
}

async function readParticipantIds(repo: Repo): Promise<string[]> {
  try {
    const data = await repo.readYaml<{ participants?: { id?: string }[] }>("meta/collaboration.yaml");
    const ids = (data.participants ?? [])
      .map((p) => p.id)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
    return ids;
  } catch {
    return [];
  }
}

async function readWorkQueueIds(repo: Repo): Promise<string[]> {
  try {
    const data = await repo.readYaml<{ items?: { id?: string }[] }>("meta/work-queue.yaml");
    const ids = (data.items ?? [])
      .map((item) => item.id)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
    return ids;
  } catch {
    return [];
  }
}

function isSafeRelativePath(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  if (path.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(value);
  if (normalized.startsWith("../") || normalized === "..") return false;
  if (normalized.includes("/../")) return false;
  return true;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export interface HandoffLogEntry {
  source_file: string;
  from: string;
  to: string;
  status: string;
  generated_at: string;
  sent_at: string | null;
  branch: string | null;
}

export interface HandoffLog {
  version: number;
  max_entries: number;
  entries: HandoffLogEntry[];
}

const DEFAULT_MAX_ENTRIES = 50;
const LOG_PATH = "meta/handoff-log.yaml";

export function createLogEntry(manifest: HandoffManifest): HandoffLogEntry {
  return {
    source_file: manifest.source_file ?? "",
    from: manifest.from ?? "",
    to: manifest.to ?? "",
    status: manifest.status ?? "pending",
    generated_at: manifest.generated_at ?? "",
    sent_at: typeof manifest.sent_at === "string" ? manifest.sent_at : null,
    branch: typeof manifest.branch === "string" ? manifest.branch : null,
  };
}

export async function readHandoffLog(root: string): Promise<HandoffLog> {
  const logFile = path.join(root, LOG_PATH);
  try {
    const text = await fs.readFile(logFile, "utf-8");
    const data = parseYaml(text) as Partial<HandoffLog> | null;
    if (data && typeof data === "object") {
      return {
        version: data.version ?? 1,
        max_entries: data.max_entries ?? DEFAULT_MAX_ENTRIES,
        entries: Array.isArray(data.entries) ? data.entries : [],
      };
    }
  } catch {
    // file doesn't exist yet
  }
  return { version: 1, max_entries: DEFAULT_MAX_ENTRIES, entries: [] };
}

export async function appendHandoffLog(
  root: string,
  entry: HandoffLogEntry,
): Promise<void> {
  const log = await readHandoffLog(root);
  log.entries.push(entry);
  if (log.entries.length > log.max_entries) {
    log.entries = log.entries.slice(log.entries.length - log.max_entries);
  }
  const logFile = path.join(root, LOG_PATH);
  await fs.writeFile(logFile, stringifyYaml(log), "utf-8");
}
