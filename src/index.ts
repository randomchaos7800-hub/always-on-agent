import { createInterface } from "readline";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { initMemoryDb } from "./memory-db.js";
import { runAgent } from "./agent.js";

// PID lockfile — prevents double-start
const LOCKFILE = "/tmp/always-on-agent.pid";
if (existsSync(LOCKFILE)) {
  const oldPid = parseInt(readFileSync(LOCKFILE, "utf-8").trim());
  try {
    process.kill(oldPid, 0);
    console.error(`Already running (PID ${oldPid}). Exiting.`);
    process.exit(1);
  } catch {
    // Stale lockfile — continue
  }
}
writeFileSync(LOCKFILE, String(process.pid));
process.on("exit", () => { try { unlinkSync(LOCKFILE); } catch {} });
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

// Suppress known SDK subprocess race condition
process.env.CLAUDE_CODE_STREAM_CLOSE_TIMEOUT = "300000";
process.on("unhandledRejection", (reason) => {
  if (reason instanceof Error && reason.message === "ProcessTransport is not ready for writing") return;
  console.error("Unhandled rejection:", reason);
});

// Init
initMemoryDb();
console.log("Agent ready. Type your message (Ctrl+C to exit).\n");

// Simple terminal REPL
// Replace this with Discord/Telegram integration — see the full guide.
const rl = createInterface({ input: process.stdin, output: process.stdout });

function prompt() {
  rl.question("You: ", async (input) => {
    const text = input.trim();
    if (!text) { prompt(); return; }

    process.stdout.write("Agent: ");
    try {
      const result = await runAgent(text);
      console.log(result.text);
      if (result.cost > 0) console.log(`  (cost: $${result.cost.toFixed(4)})\n`);
    } catch (err) {
      console.error("Error:", err);
    }

    prompt();
  });
}

prompt();
