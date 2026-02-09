import { describe, expect, it } from "vitest";

import type { AgentContract } from "../src/compiler/agent";
import { compileAgent } from "../src/compiler/agent";
import { createSchemaValidator } from "../src/lib/schema";
import agentSchema from "../src/schemas/agent.schema.json";

const MINIMAL_CONTRACT: AgentContract = {
  id: "test-agent",
  name: "Test Agent",
  role: "Tester",
  level: "specialist",
  mission: "Test everything",
  inputs: { authoritative: ["canon/test.md"], reads: ["state/*.yaml"] },
  outputs: [{ type: "report", cadence: "weekly", destination: "reports/test/" }],
  writes: { allowed: ["reports/test/**"], forbidden: ["canon/**"] },
  forbidden: ["Never delete files", "Never push to production"],
  escalation: { triggers: ["Blocked for >2h"], to: "lead" },
  heartbeat: { schedule: "*/15 * * * *", checklist: ["Check inbox", "Run reports"] },
};

describe("compileAgent", () => {
  it("produces SOUL.md with name and role", async () => {
    const bundle = await compileAgent(MINIMAL_CONTRACT);
    expect(bundle.soul).toContain("Test Agent");
    expect(bundle.soul).toContain("Tester");
  });

  it("produces AGENTS.md with mission and level guidance", async () => {
    const bundle = await compileAgent(MINIMAL_CONTRACT);
    expect(bundle.agents).toContain("Test everything");
    expect(bundle.agents).toContain("specialist");
    expect(bundle.agents).toContain("You work independently");
  });

  it("produces AGENTS.md with write permissions", async () => {
    const bundle = await compileAgent(MINIMAL_CONTRACT);
    expect(bundle.agents).toContain("reports/test/**");
    expect(bundle.agents).toContain("canon/**");
  });

  it("produces AGENTS.md with forbidden actions", async () => {
    const bundle = await compileAgent(MINIMAL_CONTRACT);
    expect(bundle.agents).toContain("Never delete files");
    expect(bundle.agents).toContain("Never push to production");
  });

  it("produces AGENTS.md with escalation", async () => {
    const bundle = await compileAgent(MINIMAL_CONTRACT);
    expect(bundle.agents).toContain("lead");
    expect(bundle.agents).toContain("Blocked for >2h");
  });

  it("produces HEARTBEAT.md with checklist items", async () => {
    const bundle = await compileAgent(MINIMAL_CONTRACT);
    expect(bundle.heartbeat).toContain("- [ ] Check inbox");
    expect(bundle.heartbeat).toContain("- [ ] Run reports");
  });

  it("produces correct cron payload shape", async () => {
    const bundle = await compileAgent(MINIMAL_CONTRACT);
    expect(bundle.cron).toEqual({
      name: "test-agent-heartbeat",
      agentId: "test-agent",
      schedule: { kind: "cron", expr: "*/15 * * * *" },
      sessionTarget: "isolated",
      wakeMode: "next-heartbeat",
      payload: {
        kind: "agentTurn",
        message: expect.stringContaining("Test Agent"),
      },
    });
  });

  it("respects session_type override", async () => {
    const contract = {
      ...MINIMAL_CONTRACT,
      heartbeat: { ...MINIMAL_CONTRACT.heartbeat, session_type: "main" as const },
    };
    const bundle = await compileAgent(contract);
    expect(bundle.cron.sessionTarget).toBe("main");
  });

  it("includes personality in SOUL.md when provided", async () => {
    const contract = {
      ...MINIMAL_CONTRACT,
      personality: {
        voice: "Direct and concise",
        strengths: ["Pattern recognition", "Speed"],
        values: ["Accuracy"],
      },
    };
    const bundle = await compileAgent(contract);
    expect(bundle.soul).toContain("Direct and concise");
    expect(bundle.soul).toContain("Pattern recognition");
    expect(bundle.soul).toContain("Accuracy");
  });

  it("includes authoritative sources in AGENTS.md", async () => {
    const bundle = await compileAgent(MINIMAL_CONTRACT);
    expect(bundle.agents).toContain("canon/test.md");
    expect(bundle.agents).toContain("ground truth");
  });

  it("handles level guidance for all levels", async () => {
    for (const level of ["intern", "specialist", "lead"] as const) {
      const contract = { ...MINIMAL_CONTRACT, level };
      const bundle = await compileAgent(contract);
      expect(bundle.agents).toContain(`Level: ${level}`);
    }
  });
});

describe("agent schema validation", () => {
  const validator = createSchemaValidator();

  it("validates a complete contract", () => {
    const errors = validator.validate(agentSchema as object, MINIMAL_CONTRACT);
    expect(errors).toHaveLength(0);
  });

  it("rejects missing required fields", () => {
    const incomplete = { id: "bad", name: "Bad" };
    const errors = validator.validate(agentSchema as object, incomplete);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid level", () => {
    const bad = { ...MINIMAL_CONTRACT, level: "god" };
    const errors = validator.validate(agentSchema as object, bad);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid id format", () => {
    const bad = { ...MINIMAL_CONTRACT, id: "Bad-Id" };
    const errors = validator.validate(agentSchema as object, bad);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts optional personality", () => {
    const withPersonality = {
      ...MINIMAL_CONTRACT,
      personality: { voice: "Calm", strengths: ["Focus"], values: ["Clarity"] },
    };
    const errors = validator.validate(agentSchema as object, withPersonality);
    expect(errors).toHaveLength(0);
  });

  it("accepts optional model config", () => {
    const withModel = {
      ...MINIMAL_CONTRACT,
      model: { default: "claude-sonnet-4-5-20250929", thinking: "claude-opus-4-6" },
    };
    const errors = validator.validate(agentSchema as object, withModel);
    expect(errors).toHaveLength(0);
  });

  it("accepts optional tools config", () => {
    const withTools = {
      ...MINIMAL_CONTRACT,
      tools: { allowed: ["web_search"], forbidden: ["shell"] },
    };
    const errors = validator.validate(agentSchema as object, withTools);
    expect(errors).toHaveLength(0);
  });
});
