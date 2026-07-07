import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { Conversation, ConversationState } from "../core/machine.js";

export interface Db {
  /** Returns true if this wamid is new (caller should process), false if already seen. */
  markProcessed(wamid: string): boolean;
  getConversation(waId: string): Conversation | undefined;
  saveConversation(conversation: Conversation): void;
  deleteConversation(waId: string): void;
  close(): void;
}

interface ConversationRow {
  wa_id: string;
  profile_name: string;
  state: string;
  origen: string | null;
  destino: string | null;
  referencia: string | null;
  last_activity: number;
}

export function openDb(dbPath: string): Db {
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS processed_messages (
      wamid        TEXT PRIMARY KEY,
      processed_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS conversations (
      wa_id         TEXT PRIMARY KEY,
      profile_name  TEXT NOT NULL,
      state         TEXT NOT NULL,
      origen        TEXT,
      destino       TEXT,
      referencia    TEXT,
      last_activity INTEGER NOT NULL
    );
  `);

  const insertProcessed = db.prepare(
    "INSERT INTO processed_messages (wamid) VALUES (?) ON CONFLICT (wamid) DO NOTHING",
  );
  const selectConversation = db.prepare("SELECT * FROM conversations WHERE wa_id = ?");
  const upsertConversation = db.prepare(`
    INSERT INTO conversations (wa_id, profile_name, state, origen, destino, referencia, last_activity)
    VALUES (@waId, @profileName, @state, @origen, @destino, @referencia, @lastActivity)
    ON CONFLICT (wa_id) DO UPDATE SET
      profile_name = excluded.profile_name,
      state = excluded.state,
      origen = excluded.origen,
      destino = excluded.destino,
      referencia = excluded.referencia,
      last_activity = excluded.last_activity
  `);
  const removeConversation = db.prepare("DELETE FROM conversations WHERE wa_id = ?");

  return {
    markProcessed(wamid: string): boolean {
      return insertProcessed.run(wamid).changes === 1;
    },

    getConversation(waId: string): Conversation | undefined {
      const row = selectConversation.get(waId) as ConversationRow | undefined;
      if (!row) return undefined;
      return {
        waId: row.wa_id,
        profileName: row.profile_name,
        state: row.state as ConversationState,
        ...(row.origen !== null && { origen: row.origen }),
        ...(row.destino !== null && { destino: row.destino }),
        ...(row.referencia !== null && { referencia: row.referencia }),
        lastActivity: row.last_activity,
      };
    },

    saveConversation(c: Conversation): void {
      upsertConversation.run({
        waId: c.waId,
        profileName: c.profileName,
        state: c.state,
        origen: c.origen ?? null,
        destino: c.destino ?? null,
        referencia: c.referencia ?? null,
        lastActivity: c.lastActivity,
      });
    },

    deleteConversation(waId: string): void {
      removeConversation.run(waId);
    },

    close() {
      db.close();
    },
  };
}
