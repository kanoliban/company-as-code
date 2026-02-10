import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const CLI = path.resolve(__dirname, "../dist/cli.js");
const CWD = path.resolve(__dirname, "..");

function run(args: string[]): { stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [CLI, ...args], { cwd: CWD, encoding: "utf-8" });
    return { stdout, stderr: "" };
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "company-init-"));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

function exists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

describe("company init", () => {
  it("scaffolds repo with samples", () => {
    const dir = createTempDir();
    try {
      const output = run(["init", "--name", "Acme Corp", "--owner", "alice", "--dir", dir]);
      expect(output.stdout).toContain("Initialized Company-as-Code repo");

      const companyYaml = path.join(dir, "company.yaml");
      expect(exists(companyYaml)).toBe(true);
      const companyText = read(companyYaml);
      expect(companyText).toContain("id: acme-corp");
      expect(companyText).toContain("name: Acme Corp");
      expect(companyText).toContain("- alice");

      expect(exists(path.join(dir, "state", "objectives.yaml"))).toBe(true);
      expect(read(path.join(dir, "state", "objectives.yaml"))).toContain("getting-started");

      expect(exists(path.join(dir, "meta", "work-queue.yaml"))).toBe(true);
      expect(read(path.join(dir, "meta", "work-queue.yaml"))).toContain("init-repo");

      expect(exists(path.join(dir, "README.md"))).toBe(true);
      expect(exists(path.join(dir, ".gitignore"))).toBe(true);

      const keepDirs = [
        "canon",
        "decisions",
        "agents",
        "interfaces",
        "artifacts",
        "reports",
        "checks",
        "state",
        "meta",
      ];

      for (const d of keepDirs) {
        expect(exists(path.join(dir, d, ".gitkeep"))).toBe(true);
      }
    } finally {
      cleanup(dir);
    }
  });

  it("respects --no-samples", () => {
    const dir = createTempDir();
    try {
      run(["init", "--name", "Bare Co", "--owner", "bob", "--dir", dir, "--no-samples"]);

      expect(exists(path.join(dir, "company.yaml"))).toBe(true);
      expect(exists(path.join(dir, ".gitignore"))).toBe(true);
      expect(exists(path.join(dir, "README.md"))).toBe(false);
      expect(exists(path.join(dir, "state", "objectives.yaml"))).toBe(false);
      expect(exists(path.join(dir, "meta", "work-queue.yaml"))).toBe(false);

      expect(exists(path.join(dir, "canon", ".gitkeep"))).toBe(true);
      expect(exists(path.join(dir, "agents", ".gitkeep"))).toBe(true);
    } finally {
      cleanup(dir);
    }
  });

  it("refuses to overwrite without --force", () => {
    const dir = createTempDir();
    try {
      run(["init", "--name", "Acme Corp", "--owner", "alice", "--dir", dir]);

      let threw = false;
      try {
        execFileSync("node", [CLI, "init", "--name", "Acme Corp", "--owner", "alice", "--dir", dir], {
          cwd: CWD,
          encoding: "utf-8",
        });
      } catch (err) {
        threw = true;
        const error = err as { stderr?: string; status?: number };
        expect(error.status).toBe(1);
        expect(error.stderr ?? "").toContain("Refusing to overwrite");
      }

      expect(threw).toBe(true);
    } finally {
      cleanup(dir);
    }
  });

  it("overwrites with --force", () => {
    const dir = createTempDir();
    try {
      run(["init", "--name", "Acme Corp", "--owner", "alice", "--dir", dir]);

      const companyYaml = path.join(dir, "company.yaml");
      fs.writeFileSync(companyYaml, "id: old-name\nname: Old Name\n", "utf-8");

      run(["init", "--name", "New Co", "--owner", "new-owner", "--dir", dir, "--force"]);

      const content = read(companyYaml);
      expect(content).toContain("id: new-co");
      expect(content).toContain("name: New Co");
    } finally {
      cleanup(dir);
    }
  });
});
