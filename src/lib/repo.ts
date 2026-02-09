import * as fs from "node:fs/promises";
import * as path from "node:path";

import fg from "fast-glob";
import matter from "gray-matter";
import { parse as parseYaml } from "yaml";

export interface Repo {
  root: string;
  glob: (pattern: string) => Promise<string[]>;
  readText: (filePath: string) => Promise<string>;
  readYaml: <T>(filePath: string) => Promise<T>;
  readFrontmatter: (filePath: string) => Promise<{ data: Record<string, unknown>; content: string }>;
  exists: (filePath: string) => Promise<boolean>;
}

export class FileSystemRepo implements Repo {
  public root: string;

  public constructor(root: string) {
    this.root = root;
  }

  public async glob(pattern: string): Promise<string[]> {
    const matches = await fg(pattern, { cwd: this.root, dot: false });
    return matches.sort();
  }

  public async readText(filePath: string): Promise<string> {
    const abs = path.resolve(this.root, filePath);
    return fs.readFile(abs, "utf-8");
  }

  public async readYaml<T>(filePath: string): Promise<T> {
    const text = await this.readText(filePath);
    return parseYaml(text) as T;
  }

  public async readFrontmatter(filePath: string): Promise<{ data: Record<string, unknown>; content: string }> {
    const text = await this.readText(filePath);
    const parsed = matter(text);
    return { data: parsed.data as Record<string, unknown>, content: parsed.content };
  }

  public async exists(filePath: string): Promise<boolean> {
    const abs = path.resolve(this.root, filePath);
    try {
      await fs.access(abs);
      return true;
    } catch {
      return false;
    }
  }
}

export function findRepoRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (dir !== root) {
    const candidate = path.join(dir, "company.yaml");
    try {
      require("node:fs").accessSync(candidate);
      return dir;
    } catch {
      dir = path.dirname(dir);
    }
  }
  return null;
}
