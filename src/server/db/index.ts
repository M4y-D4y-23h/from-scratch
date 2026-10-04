import { loadDroneCatalog } from "@/server/catalog/load";
import { loadGlossary } from "@/server/glossary/load";

import { type Db, openDatabase } from "./client";
import { type SyncResult, syncDroneCatalog, syncGlossary } from "./sync";

export type { Db } from "./client";

// Uma conexão por processo. No `pnpm dev` o Next recarrega módulos; guardar no globalThis evita
// abrir uma conexão nova a cada recarga.
const cache = globalThis as typeof globalThis & { __fromScratchDb?: Db };

/** Recarrega catálogo e glossário dos arquivos e atualiza o espelho no banco se algo mudou. */
export function syncAll(db: Db): SyncResult[] {
  return [syncDroneCatalog(db, loadDroneCatalog()), syncGlossary(db, loadGlossary())];
}

/** Banco pronto para uso: migrado e com o catálogo atualizado. */
export function getDb(): Db {
  if (!cache.__fromScratchDb) {
    const db = openDatabase();
    syncAll(db);
    cache.__fromScratchDb = db;
  }
  return cache.__fromScratchDb;
}
