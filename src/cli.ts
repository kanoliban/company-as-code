import { Command } from "commander";
import { registerCheckCommand } from "./commands/check";
import { registerInitCommand } from "./commands/init";
import { registerSyncCommand } from "./commands/sync";
import { registerViewCommand } from "./commands/view";

export const buildCli = (): Command => {
  const program = new Command();

  program
    .name("company")
    .description("Company-as-Code CLI")
    .version("0.1.0");

  registerInitCommand(program);
  registerCheckCommand(program);
  registerSyncCommand(program);
  registerViewCommand(program);

  return program;
};

export const runCli = async (): Promise<void> => {
  const program = buildCli();
  await program.parseAsync(process.argv);
};

void runCli();
