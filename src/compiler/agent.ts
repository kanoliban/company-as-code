export interface AgentPersonality {
  voice?: string;
  strengths?: string[];
  values?: string[];
}

export interface AgentInputs {
  authoritative?: string[];
  reads?: string[];
}

export interface AgentOutput {
  type: string;
  cadence: string;
  destination: string;
}

export interface AgentWrites {
  allowed: string[];
  forbidden: string[];
}

export interface AgentEscalation {
  triggers: string[];
  to: string;
}

export interface AgentHeartbeat {
  schedule: string;
  session_type?: "isolated" | "main";
  checklist: string[];
}

export interface AgentModel {
  default?: string;
  thinking?: string;
  expensive_tasks?: string;
}

export interface AgentTools {
  profile?: "safe" | "standard" | "elevated";
  allowed?: string[];
  forbidden?: string[];
}

export interface AgentContract {
  id: string;
  name: string;
  role: string;
  level: "intern" | "specialist" | "lead";
  mission: string;
  personality?: AgentPersonality;
  inputs: AgentInputs;
  outputs: AgentOutput[];
  writes: AgentWrites;
  forbidden: string[];
  escalation: AgentEscalation;
  heartbeat: AgentHeartbeat;
  model?: AgentModel;
  tools?: AgentTools;
}

export interface AgentBundle {
  soul: string;
  agents: string;
  heartbeat: string;
  cron: Record<string, unknown>;
}

const LEVEL_GUIDANCE: Record<AgentContract["level"], string> = {
  intern: "You need approval for most actions. Ask before acting.",
  specialist: "You work independently in your domain.",
  lead: "Full autonomy. You can make decisions and delegate.",
};

const renderList = (items: string[] | undefined, prefix = "- "): string => {
  if (!items || items.length === 0) return "";
  return items.map((item) => `${prefix}${item}`).join("\n");
};

const renderCodeList = (items: string[] | undefined): string => {
  if (!items || items.length === 0) return "";
  return items.map((item) => `- \`${item}\``).join("\n");
};

const renderOutputs = (outputs: AgentOutput[]): string => {
  return outputs
    .map((output) => `- **${output.type}** (${output.cadence}) \u2192 \`${output.destination}\``)
    .join("\n");
};

export const compileAgent = async (contract: AgentContract): Promise<AgentBundle> => {
  const soul = [
    "# SOUL.md — Who You Are",
    "",
    `**Name:** ${contract.name}`,
    `**Role:** ${contract.role}`,
    "",
    "## Personality",
    contract.personality?.voice ?? "",
    "",
    "## What You're Good At",
    renderList(contract.personality?.strengths),
    "",
    "## What You Care About",
    renderList(contract.personality?.values),
    "",
  ].join("\n");

  const agents = [
    "# AGENTS.md — How You Operate",
    "",
    "## Mission",
    contract.mission,
    "",
    `## Level: ${contract.level}`,
    LEVEL_GUIDANCE[contract.level],
    "",
    "## Authoritative Sources",
    "These documents are your ground truth. Do not contradict them:",
    renderList(contract.inputs.authoritative),
    "",
    "## What You Read",
    renderList(contract.inputs.reads),
    "",
    "## What You Produce",
    renderOutputs(contract.outputs),
    "",
    "## Where You Can Write",
    renderCodeList(contract.writes.allowed),
    "",
    "## Where You Cannot Write",
    renderCodeList(contract.writes.forbidden),
    "",
    "## Tool Profile",
    `Profile: ${contract.tools?.profile ?? "safe"}`,
    "",
    "### Allowed Tools",
    renderCodeList(contract.tools?.allowed),
    "",
    "### Forbidden Tools",
    renderCodeList(contract.tools?.forbidden),
    "",
    "## Forbidden Actions",
    renderList(contract.forbidden),
    "",
    `## Escalation\nWhen any of these occur, escalate to **${contract.escalation.to}**:`,
    renderList(contract.escalation.triggers),
    "",
  ].join("\n");

  const heartbeat = [
    "# HEARTBEAT.md",
    "",
    "## On Wake",
    contract.heartbeat.checklist.map((item) => `- [ ] ${item}`).join("\n"),
    "",
  ].join("\n");

  const sessionTarget = contract.heartbeat.session_type ?? "isolated";
  const cron = {
    name: `${contract.id}-heartbeat`,
    agentId: contract.id,
    schedule: { kind: "cron" as const, expr: contract.heartbeat.schedule },
    sessionTarget,
    wakeMode: "next-heartbeat" as const,
    payload: {
      kind: "agentTurn" as const,
      message: `You are ${contract.name}, the ${contract.role}. Follow your HEARTBEAT.md checklist.`,
    },
  };

  return { soul, agents, heartbeat, cron };
};
