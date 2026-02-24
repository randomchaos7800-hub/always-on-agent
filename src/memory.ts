import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getCoreMemory } from "./memory-db.js";
import { config, ROOT_DIR } from "./config.js";

function loadSoul(): string {
  const soulPath = join(ROOT_DIR, "SOUL.md");
  if (existsSync(soulPath)) return readFileSync(soulPath, "utf-8");
  return "You are a helpful personal AI assistant.";
}

export function buildSystemPrompt(): string {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA", { timeZone: config.timezone });
  const time = now.toLocaleTimeString("en-US", {
    timeZone: config.timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const blocks = getCoreMemory();
  const coreMemory = Object.entries(blocks)
    .filter(([k]) => !k.startsWith("session:") && !k.startsWith("spend:"))
    .map(([k, v]) => `### ${k}\n${v || "(empty)"}`)
    .join("\n\n");

  return [
    loadSoul(),
    `# Core Memory\n${coreMemory}`,
    `# Context\nDate: ${date}\nTime: ${time}`,
    `# Execution Rules
- DO THE THING. Execute directly — don't describe what you would do.
- If a tool call fails twice, try a different approach or ask.
- Prove completion with actual output, not descriptions.
- When you learn something important about the user, store it in archival memory.
- When you make a mistake, note it in core memory so you don't repeat it.`,
  ].join("\n\n---\n\n");
}
