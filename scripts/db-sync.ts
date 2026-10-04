/*
 * Cria/atualiza o banco local: aplica migrações e espelha catálogo e glossário.
 * Uso: pnpm db:sync   (o app também faz isso sozinho ao abrir o banco)
 */
import { syncAll } from "@/server/db";
import { openDatabase, resolveDbPath } from "@/server/db/client";

const arquivo = resolveDbPath();
const db = openDatabase(arquivo);
console.log(`Banco: ${arquivo}`);
for (const r of syncAll(db)) {
  console.log(`- ${r.fonte}: ${r.itens} item(ns), ${r.mudou ? "atualizado" : "já estava em dia"}.`);
}
