import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config.js";
import { buildSystemPrompt } from "./memory.js";
import { memoryMcpServer, MEMORY_TOOL_NAMES } from "./memory-tools.js";
import { insertRecall, getSession, setSession, getDailySpend, addDailySpend } from "./memory-db.js";

export interface AgentResult {
  text: string;
  cost: number;
}

const DAILY_BUDGET_USD = 20.0;

function detectLoop(history: string[]): boolean {
  if (history.length < 3) return false;
  const last3 = history.slice(-3);
  return last3[0] === last3[1] && last3[1] === last3[2];
}

export async function runAgent(
  prompt: string,
  chatId = "default",
  modelOverride?: string
): Promise<AgentResult> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: config.timezone });
  const currentSpend = getDailySpend(today);

  if (currentSpend >= DAILY_BUDGET_USD) {
    return {
      text: `Daily budget cap reached ($${currentSpend.toFixed(2)}). Resets at midnight.`,
      cost: 0,
    };
  }

  const systemPrompt = buildSystemPrompt();
  const existingSession = getSession(chatId);

  const q = query({
    prompt,
    options: {
      model: modelOverride ?? config.model,
      systemPrompt,
      permissionMode: "bypassPermissions",
      maxTurns: 30,
      cwd: process.env.HOME ?? "/",
      mcpServers: { "agent-memory": memoryMcpServer },
      allowedTools: ["Bash", "Read", "Write", "WebSearch", "WebFetch", ...MEMORY_TOOL_NAMES],
      ...(existingSession ? { resume: existingSession } : {}),
    },
  });

  let resultText = "";
  let cost = 0;
  let sessionId = existingSession ?? "";
  const toolHistory: string[] = [];

  for await (const message of q) {
    if (message.type === "assistant") {
      resultText = "";
      for (const block of message.message.content) {
        if (block.type === "text") resultText += block.text;
        if (block.type === "tool_use") toolHistory.push(block.name);
      }
      if (detectLoop(toolHistory)) {
        await q.interrupt();
        resultText += "\n\n(Loop detected — stopping.)";
        break;
      }
    } else if (message.type === "result") {
      sessionId = message.session_id;
      if (message.subtype === "success") {
        cost = message.total_cost_usd ?? 0;
        resultText = message.result || resultText;
      }
    }
  }

  if (sessionId) setSession(chatId, sessionId);
  addDailySpend(today, cost);

  insertRecall(chatId, "user", prompt.slice(0, 500));
  insertRecall(chatId, "assistant", resultText.slice(0, 1000));

  return { text: resultText, cost };
}
