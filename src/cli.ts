import { Command } from "commander";
import { registerCheckCommand } from "./commands/check";
import { registerDiffCommand } from "./commands/diff";
import { registerDoctorCommand } from "./commands/doctor";
import { registerHandoffCommand } from "./commands/handoff";
import { registerInitCommand } from "./commands/init";
import { registerLogCommand } from "./commands/log";
import { registerNormalizeCommand } from "./commands/normalize";
import { registerPluginCommand } from "./commands/plugin";
import { registerReceiveCommand } from "./commands/receive";
import { registerSimulateCommand } from "./commands/simulate";
import { registerStatusCommand } from "./commands/status";
import { registerSyncCommand } from "./commands/sync";
import { registerValidateCommand } from "./commands/validate";
import { registerViewCommand } from "./commands/view";

export const buildCli = (): Command => {
  const program = new Command();

  program
    .name("company")
    .description("Company-as-Code CLI")
    .version("0.1.0");

  registerInitCommand(program);
  registerCheckCommand(program);
  registerDiffCommand(program);
  registerDoctorCommand(program);
  registerHandoffCommand(program);
  registerLogCommand(program);
  registerNormalizeCommand(program);
  registerPluginCommand(program);
  registerReceiveCommand(program);
  registerSimulateCommand(program);
  registerSyncCommand(program);
  registerStatusCommand(program);
  registerValidateCommand(program);
  registerViewCommand(program);

  return program;
};

export const runCli = async (): Promise<void> => {
  const program = buildCli();
  await program.parseAsync(process.argv);
};

void runCli();
