import { mkdirSync } from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "./schema";

/** Banco local (ignorado pelo git). Dá para trocar com a variável FROM_SCRATCH_DB. */
export const DEFAULT_DB_PATH = path.resolve(process.cwd(), "data", "local", "from-scratch.db");
export const MIGRATIONS_DIR = path.resolve(process.cwd(), "src", "server", "db", "migrations");

export type Db = BetterSQLite3Database<typeof schema>;

export function resolveDbPath(env: string | undefined = process.env.FROM_SCRATCH_DB): string {
  if (!env) return DEFAULT_DB_PATH;
  return env === ":memory:" ? env : path.resolve(process.cwd(), env);
}

/** Abre o banco e aplica as migrações pendentes. ":memory:" cria um banco temporário (testes). */
export function openDatabase(file = resolveDbPath()): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  // WAL: leituras não esperam escritas; foreign_keys: o SQLite só confere chaves se pedirmos.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}
