// SQLite persistence behind a small Repository interface. The interface is the
// point: the engine/API depend on MatchRepository, not on SQLite — so a future
// ChromaDB (for semantic search over transcripts) slots in alongside this
// without touching the rest of the app.

import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { MatchResult } from "./types.js";

export interface LeaderboardRow {
  debaterId: string;
  name: string;
  wins: number;
  matches: number;
  points: number;
}

export interface MatchRepository {
  save(result: MatchResult): void;
  get(id: string): MatchResult | null;
  list(limit?: number): { matchId: string; topic: string; createdAt: string; winnerId: string }[];
  leaderboard(): LeaderboardRow[];
  clearAll(): void;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

export class SqliteMatchRepository implements MatchRepository {
  private db: Database.Database;

  // Path resolves from CLASHBOTS_DB when set (e.g. a mounted persistent disk on
  // Render: "/data/clashbots.db"), else a file next to the server source for dev.
  constructor(file = process.env.CLASHBOTS_DB || join(__dirname, "..", "clashbots.db")) {
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        id         TEXT PRIMARY KEY,
        topic      TEXT NOT NULL,
        created_at TEXT NOT NULL,
        winner_id  TEXT NOT NULL,
        payload    TEXT NOT NULL  -- full MatchResult JSON for fast replay
      );
      CREATE TABLE IF NOT EXISTS results (
        match_id   TEXT NOT NULL,
        debater_id TEXT NOT NULL,
        name       TEXT NOT NULL,
        points     INTEGER NOT NULL,
        won        INTEGER NOT NULL,
        PRIMARY KEY (match_id, debater_id)
      );
    `);
  }

  save(result: MatchResult): void {
    const tx = this.db.transaction((r: MatchResult) => {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO matches (id, topic, created_at, winner_id, payload)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(r.matchId, r.topic, r.createdAt, r.winnerId, JSON.stringify(r));

      const stmt = this.db.prepare(
        `INSERT OR REPLACE INTO results (match_id, debater_id, name, points, won)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const d of r.debaters) {
        stmt.run(r.matchId, d.id, d.name, r.totals[d.id] ?? 0, d.id === r.winnerId ? 1 : 0);
      }
    });
    tx(result);
  }

  get(id: string): MatchResult | null {
    const row = this.db.prepare(`SELECT payload FROM matches WHERE id = ?`).get(id) as
      | { payload: string }
      | undefined;
    return row ? (JSON.parse(row.payload) as MatchResult) : null;
  }

  list(limit = 20) {
    return this.db
      .prepare(
        `SELECT id as matchId, topic, created_at as createdAt, winner_id as winnerId
         FROM matches ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as { matchId: string; topic: string; createdAt: string; winnerId: string }[];
  }

  leaderboard(): LeaderboardRow[] {
    return this.db
      .prepare(
        `SELECT debater_id as debaterId, name,
                SUM(won) as wins, COUNT(*) as matches, SUM(points) as points
         FROM results GROUP BY debater_id, name
         ORDER BY wins DESC, points DESC`,
      )
      .all() as LeaderboardRow[];
  }

  clearAll(): void {
    this.db.transaction(() => {
      this.db.prepare(`DELETE FROM results`).run();
      this.db.prepare(`DELETE FROM matches`).run();
    })();
  }
}
