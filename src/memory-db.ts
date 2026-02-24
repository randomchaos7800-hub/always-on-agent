import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync } from "fs";
import { config } from "./config.js";

let db: Database.Database;

export function initMemoryDb(): void {
  mkdirSync(config.workspace, { recursive: true });
  db = new Database(join(config.workspace, "memory.db"));
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS core_memory (
      block TEXT PRIMARY KEY,
      content TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS recall (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now')),
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS archival (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now')),
      content TEXT NOT NULL,
      tags TEXT,
      source TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS recall_fts
      USING fts5(content, content='recall', content_rowid='id');

    CREATE VIRTUAL TABLE IF NOT EXISTS archival_fts
      USING fts5(content, tags, content='archival', content_rowid='id');
  `);

  // Seed default core memory blocks
  const seed = db.prepare("INSERT OR IGNORE INTO core_memory (block, content) VALUES (?, ?)");
  seed.run("persona", "Personal AI assistant. Direct, efficient, honest.");
  seed.run("user", "");
  seed.run("tasks", "");
}

// Core memory

export function getCoreMemory(): Record<string, string> {
  const rows = db.prepare("SELECT block, content FROM core_memory ORDER BY block").all() as { block: string; content: string }[];
  return Object.fromEntries(rows.map((r) => [r.block, r.content]));
}

export function replaceCoreBlock(
  block: string,
  oldText: string,
  newText: string
): { ok: boolean; error?: string } {
  const row = db.prepare("SELECT content FROM core_memory WHERE block = ?").get(block) as { content: string } | undefined;
  if (!row) return { ok: false, error: `Block '${block}' not found.` };
  if (!row.content.includes(oldText)) return { ok: false, error: `old_text not found in block '${block}'.` };
  const updated = row.content.replace(oldText, newText);
  db.prepare("UPDATE core_memory SET content = ? WHERE block = ?").run(updated, block);
  return { ok: true };
}

export function appendCoreBlock(block: string, text: string): { ok: boolean; error?: string } {
  const row = db.prepare("SELECT content FROM core_memory WHERE block = ?").get(block) as { content: string } | undefined;
  if (!row) return { ok: false, error: `Block '${block}' not found.` };
  const updated = row.content ? `${row.content}\n${text}` : text;
  db.prepare("UPDATE core_memory SET content = ? WHERE block = ?").run(updated, block);
  return { ok: true };
}

// Recall

export function insertRecall(chatId: string, role: string, content: string): void {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO recall (chat_id, role, content) VALUES (?, ?, ?)")
    .run(chatId, role, content.slice(0, 2000));
  db.prepare("INSERT INTO recall_fts (rowid, content) VALUES (?, ?)").run(lastInsertRowid, content.slice(0, 2000));
}

export function searchRecall(query: string, limit = 10): { id: number; timestamp: string; role: string; content: string }[] {
  return db
    .prepare(
      `SELECT r.id, r.timestamp, r.role, r.content
       FROM recall r
       JOIN recall_fts f ON r.id = f.rowid
       WHERE recall_fts MATCH ?
       ORDER BY r.id DESC LIMIT ?`
    )
    .all(query, limit) as { id: number; timestamp: string; role: string; content: string }[];
}

// Archival

export function insertArchival(content: string, tags?: string, source?: string): number {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO archival (content, tags, source) VALUES (?, ?, ?)")
    .run(content, tags ?? null, source ?? null);
  db.prepare("INSERT INTO archival_fts (rowid, content, tags) VALUES (?, ?, ?)").run(lastInsertRowid, content, tags ?? "");
  return lastInsertRowid as number;
}

export function searchArchival(query: string, limit = 10): { id: number; timestamp: string; content: string; tags: string }[] {
  return db
    .prepare(
      `SELECT a.id, a.timestamp, a.content, a.tags
       FROM archival a
       JOIN archival_fts f ON a.id = f.rowid
       WHERE archival_fts MATCH ?
       ORDER BY rank LIMIT ?`
    )
    .all(query, limit) as { id: number; timestamp: string; content: string; tags: string }[];
}

export function deleteArchival(id: number): boolean {
  const result = db.prepare("DELETE FROM archival WHERE id = ?").run(id);
  if (result.changes > 0) {
    db.prepare("DELETE FROM archival_fts WHERE rowid = ?").run(id);
    return true;
  }
  return false;
}

// Session persistence

export function getSession(chatId: string): string | null {
  const row = db
    .prepare("SELECT content FROM core_memory WHERE block = ?")
    .get(`session:${chatId}`) as { content: string } | undefined;
  return row?.content ?? null;
}

export function setSession(chatId: string, sessionId: string): void {
  db.prepare("INSERT OR REPLACE INTO core_memory (block, content) VALUES (?, ?)").run(`session:${chatId}`, sessionId);
}

// Daily spend tracking

export function getDailySpend(date: string): number {
  const row = db
    .prepare("SELECT content FROM core_memory WHERE block = ?")
    .get(`spend:${date}`) as { content: string } | undefined;
  return row ? parseFloat(row.content) : 0;
}

export function addDailySpend(date: string, amount: number): void {
  const current = getDailySpend(date);
  db.prepare("INSERT OR REPLACE INTO core_memory (block, content) VALUES (?, ?)").run(
    `spend:${date}`,
    String(current + amount)
  );
}
