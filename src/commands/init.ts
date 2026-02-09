import type { Command } from "commander";

export const registerInitCommand = (program: Command): void => {
  program
    .command("init")
    .description("Scaffold a new Company-as-Code repo")
    .option("--name <name>", "company name")
    .option("--owner <owner>", "primary owner")
    .option("--dir <path>", "target directory", ".")
    .option("--force", "overwrite existing files")
    .option("--no-samples", "omit sample content")
    .action(async () => {
      console.error("company init is not implemented yet");
      process.exitCode = 1;
    });
};
