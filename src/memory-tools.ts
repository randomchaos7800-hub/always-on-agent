import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  getCoreMemory,
  replaceCoreBlock,
  appendCoreBlock,
  searchRecall,
  insertArchival,
  searchArchival,
  deleteArchival,
} from "./memory-db.js";

const memoryTools = [
  tool(
    "core_memory_view",
    "View all core memory blocks — persona, user facts, and current tasks.",
    {},
    async () => {
      const blocks = getCoreMemory();
      const text = Object.entries(blocks)
        .filter(([k]) => !k.startsWith("session:") && !k.startsWith("spend:"))
        .map(([k, v]) => `=== ${k} ===\n${v || "(empty)"}`)
        .join("\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  ),

  tool(
    "core_memory_replace",
    "Replace a specific string in a core memory block. old_text must match exactly.",
    {
      block: z.enum(["persona", "user", "tasks"]),
      old_text: z.string().describe("Exact text to find and replace"),
      new_text: z.string().describe("Text to replace it with"),
    },
    async (args) => {
      const result = replaceCoreBlock(args.block, args.old_text, args.new_text);
      return { content: [{ type: "text" as const, text: result.ok ? "Updated." : `Failed: ${result.error}` }] };
    }
  ),

  tool(
    "core_memory_append",
    "Append text to a core memory block.",
    {
      block: z.enum(["persona", "user", "tasks"]),
      text: z.string(),
    },
    async (args) => {
      const result = appendCoreBlock(args.block, args.text);
      return { content: [{ type: "text" as const, text: result.ok ? "Appended." : `Failed: ${result.error}` }] };
    }
  ),

  tool(
    "recall_search",
    "Search conversation history using full-text search.",
    {
      query: z.string(),
      limit: z.number().optional().default(10),
    },
    async (args) => {
      const results = searchRecall(args.query, args.limit);
      if (!results.length) return { content: [{ type: "text" as const, text: "No results found." }] };
      const text = results.map((r) => `[${r.timestamp}] ${r.role}: ${r.content}`).join("\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  ),

  tool(
    "archival_store",
    "Store important facts or knowledge for long-term retrieval.",
    {
      content: z.string(),
      tags: z.string().optional().describe("Space-separated tags for search"),
    },
    async (args) => {
      const id = insertArchival(args.content, args.tags);
      return { content: [{ type: "text" as const, text: `Stored (id: ${id}).` }] };
    }
  ),

  tool(
    "archival_search",
    "Search long-term knowledge store using full-text search.",
    {
      query: z.string(),
      limit: z.number().optional().default(10),
    },
    async (args) => {
      const results = searchArchival(args.query, args.limit);
      if (!results.length) return { content: [{ type: "text" as const, text: "No results found." }] };
      const text = results.map((r) => `[id:${r.id} | ${r.timestamp}] ${r.content}`).join("\n\n");
      return { content: [{ type: "text" as const, text }] };
    }
  ),

  tool(
    "archival_delete",
    "Delete an entry from the archival store by id.",
    { id: z.number() },
    async (args) => {
      const deleted = deleteArchival(args.id);
      return { content: [{ type: "text" as const, text: deleted ? `Deleted id:${args.id}.` : `Not found: id:${args.id}.` }] };
    }
  ),
];

export const memoryMcpServer = createSdkMcpServer({
  name: "agent-memory",
  version: "1.0.0",
  tools: memoryTools,
});

export const MEMORY_TOOL_NAMES = memoryTools.map((t) => `mcp__agent-memory__${t.name}`);
