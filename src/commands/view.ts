import type { Command } from "commander";

import { FileSystemRepo, findRepoRoot } from "../lib/repo";

type SectionName = "objectives" | "risks" | "pipeline" | "work-queue";

interface ViewOptions {
  section?: string;
  format: string;
}

interface StateItem {
  id: string;
  title: string;
  owner: string;
  status: string;
  as_of?: string;
  review_by?: string;
  summary?: string;
  severity?: string;
  depends_on?: string[];
}

interface StateFile {
  items: StateItem[];
}

const SECTIONS: SectionName[] = ["objectives", "risks", "pipeline", "work-queue"];

const SECTION_FILES: Record<SectionName, string> = {
  objectives: "state/objectives.yaml",
  risks: "state/risks.yaml",
  pipeline: "state/pipeline.yaml",
  "work-queue": "meta/work-queue.yaml",
};

export const registerViewCommand = (program: Command): void => {
  program
    .command("view")
    .description("Render a summary from the repo")
    .option("--section <name>", "section to render (objectives|risks|pipeline|work-queue)")
    .option("--format <format>", "output format (pretty|json)", "pretty")
    .action(async (opts: ViewOptions) => {
      const root = findRepoRoot(process.cwd());
      if (!root) {
        console.error("No company.yaml found. Run `company init` first or cd into a Company-as-Code repo.");
        process.exitCode = 2;
        return;
      }

      const repo = new FileSystemRepo(root);
      const sections = opts.section ? [opts.section as SectionName] : SECTIONS;

      const data: Record<string, StateItem[]> = {};
      for (const section of sections) {
        const file = SECTION_FILES[section];
        if (!file) {
          console.error(`Unknown section: ${section}`);
          process.exitCode = 2;
          return;
        }
        const exists = await repo.exists(file);
        if (!exists) continue;
        const parsed = await repo.readYaml<StateFile>(file);
        data[section] = parsed.items ?? [];
      }

      if (opts.format === "json") {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(formatView(data));
      }
    });
};

function formatView(data: Record<string, StateItem[]>): string {
  const lines: string[] = ["company view", ""];

  for (const [section, items] of Object.entries(data)) {
    lines.push(`  ${sectionLabel(section)}`);
    if (items.length === 0) {
      lines.push("    (none)");
    } else {
      for (const item of items) {
        lines.push(formatItem(section, item));
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function sectionLabel(section: string): string {
  switch (section) {
    case "objectives": return "\u{1f3af} Objectives";
    case "risks": return "\u26a0 Risks";
    case "pipeline": return "\u{1f6a7} Pipeline";
    case "work-queue": return "\u{1f4cb} Work Queue";
    default: return section;
  }
}

const STATUS_ICONS: Record<string, string> = {
  active: "\u25cf",
  done: "\u2713",
  shipped: "\u2713",
  in_progress: "\u25b6",
  ready: "\u25cb",
  blocked: "\u25a0",
  paused: "\u25a1",
  mitigated: "\u2713",
  closed: "\u2713",
};

function formatItem(section: string, item: StateItem): string {
  const icon = STATUS_ICONS[item.status] ?? "\u00b7";
  const owner = item.owner ? ` (${item.owner})` : "";
  const suffix = section === "risks" && item.severity ? ` [${item.severity}]` : "";
  return `    ${icon} ${item.id}: ${item.title}${owner}${suffix}`;
}
