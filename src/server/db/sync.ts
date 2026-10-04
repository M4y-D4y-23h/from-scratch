import { eq } from "drizzle-orm";

import type { LoadedCatalog } from "@/server/catalog/load";
import type { LoadedGlossary } from "@/server/glossary/load";

import type { Db } from "./client";
import {
  arquetipos,
  catalogoMeta,
  componentes,
  dronesProntos,
  ferramentas,
  perfisFirmware,
  tabelasEmpuxo,
  termosGlossario,
} from "./schema";

/*
 * Espelha o catálogo (arquivos versionados) no banco. Só reescreve quando o hash muda, dentro de
 * uma transação: ou o espelho inteiro é trocado, ou nada muda.
 */

export type SyncResult = { fonte: string; mudou: boolean; itens: number; hash: string };

/** Insere em blocos para não passar do limite de variáveis por comando do SQLite. */
function chunks<T>(rows: readonly T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function currentHash(db: Db, fonte: string): string | undefined {
  return db.select().from(catalogoMeta).where(eq(catalogoMeta.fonte, fonte)).get()?.hash;
}

/** Banco ou transação: os dois sabem inserir. */
type Writer = Pick<Db, "insert">;

function saveMeta(db: Writer, fonte: string, hash: string, itens: number, agora: Date) {
  db.insert(catalogoMeta)
    .values({ fonte, hash, itens, sincronizado_em: agora })
    .onConflictDoUpdate({
      target: catalogoMeta.fonte,
      set: { hash, itens, sincronizado_em: agora },
    })
    .run();
}

export function syncDroneCatalog(db: Db, loaded: LoadedCatalog, agora = new Date()): SyncResult {
  const { catalog, hash } = loaded;
  const itens =
    catalog.componentes.length +
    catalog.empuxo.length +
    catalog.ferramentas.length +
    catalog.arquetipos.length +
    catalog.perfis_firmware.length +
    catalog.prontos.length;
  if (currentHash(db, "drone") === hash) return { fonte: "drone", mudou: false, itens, hash };

  db.transaction((tx) => {
    // Ordem importa: tabelas de empuxo apontam para componentes.
    tx.delete(tabelasEmpuxo).run();
    tx.delete(componentes).run();
    tx.delete(ferramentas).run();
    tx.delete(arquetipos).run();
    tx.delete(perfisFirmware).run();
    tx.delete(dronesProntos).run();

    for (const bloco of chunks(catalog.componentes)) {
      tx.insert(componentes)
        .values(
          bloco.map((c) => ({
            id: c.id,
            categoria: c.categoria,
            marca: c.marca,
            modelo: c.modelo,
            massa_g: c.massa_g ?? null,
            preco_min_brl: c.preco_estimado_brl?.min ?? null,
            preco_max_brl: c.preco_estimado_brl?.max ?? null,
            preco_min_usd: c.preco_referencia_usd?.min ?? null,
            preco_max_usd: c.preco_referencia_usd?.max ?? null,
            status_verificacao: c.status_verificacao,
            dados: c,
          })),
        )
        .run();
    }
    for (const bloco of chunks(catalog.empuxo)) {
      tx.insert(tabelasEmpuxo)
        .values(
          bloco.map((t) => ({
            id: t.id,
            motor_id: t.motor_id,
            helice_id: t.helice_id,
            celulas: t.celulas,
            status_verificacao: t.status_verificacao,
            dados: t,
          })),
        )
        .run();
    }
    for (const bloco of chunks(catalog.ferramentas)) {
      tx.insert(ferramentas)
        .values(
          bloco.map((t) => ({
            id: t.id,
            nome: t.nome,
            tipo: t.tipo,
            prioridade: t.prioridade,
            preco_min_brl: t.preco_estimado_brl?.min ?? null,
            preco_max_brl: t.preco_estimado_brl?.max ?? null,
            preco_data: t.preco_estimado_brl?.data ?? null,
            dados: t,
          })),
        )
        .run();
    }
    for (const a of catalog.arquetipos) {
      tx.insert(arquetipos)
        .values({ id: a.id, nome: a.nome, firmware: a.firmware, dados: a })
        .run();
    }
    for (const p of catalog.perfis_firmware) {
      tx.insert(perfisFirmware)
        .values({ id: p.id, firmware: p.firmware, versao_min: p.versao_min, dados: p })
        .run();
    }
    for (const r of catalog.prontos) {
      tx.insert(dronesProntos)
        .values({
          id: r.id,
          arquetipo_id: r.arquetipo_id,
          tipo: r.tipo,
          marca: r.marca,
          modelo: r.modelo,
          preco_min_usd: r.preco_referencia_usd?.min ?? null,
          preco_max_usd: r.preco_referencia_usd?.max ?? null,
          dados: r,
        })
        .run();
    }
    saveMeta(tx, "drone", hash, itens, agora);
  });
  return { fonte: "drone", mudou: true, itens, hash };
}

export function syncGlossary(db: Db, loaded: LoadedGlossary, agora = new Date()): SyncResult {
  const { termos, hash } = loaded;
  if (currentHash(db, "glossario") === hash) {
    return { fonte: "glossario", mudou: false, itens: termos.length, hash };
  }
  db.transaction((tx) => {
    tx.delete(termosGlossario).run();
    for (const bloco of chunks(termos)) {
      tx.insert(termosGlossario)
        .values(
          bloco.map((t) => ({
            termo: t.termo,
            explicacao: t.explicacao,
            analogia: t.analogia ?? null,
            relacionados: t.relacionados,
          })),
        )
        .run();
    }
    saveMeta(tx, "glossario", hash, termos.length, agora);
  });
  return { fonte: "glossario", mudou: true, itens: termos.length, hash };
}
