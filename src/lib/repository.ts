import type { DB } from "./types";
import { seed } from "./seed";

/**
 * Persistence boundary. The prototype keeps the whole graph in localStorage.
 * Swap this for a SupabaseRepository (auth, row-level tables, realtime
 * channels per challenge room) without touching screens or components.
 */
export interface TycheRepository {
  load(): DB;
  save(db: DB): void;
  reset(): DB;
}

const KEY = "tyche:db:v1";

export const localRepository: TycheRepository = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const db = JSON.parse(raw) as DB;
        if (db.version === 2) return db;
      }
    } catch {
      /* storage unavailable or corrupt — fall through to seed */
    }
    const db = seed();
    this.save(db);
    return db;
  },
  save(db) {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* quota or private mode: keep running in memory */
    }
  },
  reset() {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    const db = seed();
    this.save(db);
    return db;
  },
};
