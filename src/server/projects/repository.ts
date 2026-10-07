import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { Tier } from "@/domain/categories/drone/build";
import type { BuildMetrics } from "@/domain/categories/drone/compatibility";
import type { CostReport } from "@/domain/categories/drone/costs";
import type { DifficultyReport } from "@/domain/categories/drone/difficulty";
import type { LocationGroup } from "@/domain/categories/drone/locations";
import type { DroneScene } from "@/domain/categories/drone/scene";
import { type Component, componentSchema } from "@/domain/categories/drone/schema";
import { type BuildChoice, buildChoiceSchema } from "@/domain/categories/drone/swap";
import type { SafetyAlert } from "@/domain/core/safety";
import type { ValidationReport } from "@/domain/core/validation";
import type { Db } from "@/server/db";
import { projetos, versoesProjeto } from "@/server/db/schema";

/*
 * Projetos e versões (SPEC B.5 e B.10.8): "toda alteração gera nova versão". Cada versão guarda a
 * ESCOLHA (slot → peça, o que a pessoa decidiu), uma cópia das peças usadas e os resultados
 * calculados naquele momento, com o hash do catálogo (ADR-0015). Versões nunca são apagadas nem
 * editadas: voltar para uma versão antiga cria uma versão nova igual a ela.
 */

export type VersionSnapshot = {
  escolha: BuildChoice;
  /** Cópia das peças usadas: se uma sair do catálogo, a versão continua reproduzível. */
  pecas: Component[];
  validacao: ValidationReport;
  metricas: BuildMetrics;
  dificuldade: DifficultyReport;
  custos: CostReport;
  locais: LocationGroup[];
  alertas: SafetyAlert[];
  cena?: DroneScene;
};

/** O que veio do pedido em linguagem natural (SPEC B.5): só na versão criada pelo pipeline. */
export type RequestRecord = {
  intencao: unknown;
  respostas: Record<string, string>;
  /** As opções mostradas (resumo de cada faixa) e qual foi escolhida. */
  opcoes: unknown;
  opcao_escolhida: string;
};

export type NewVersion = {
  motivo: string;
  catalogo_hash: string;
  snapshot: VersionSnapshot;
  pedido?: RequestRecord;
};

export type ProjectSummary = {
  id: string;
  titulo: string;
  versao_atual: number;
  criado_em: Date;
  atualizado_em: Date;
  arquetipo_id?: string;
  faixa_origem?: Tier;
};

export type VersionSummary = {
  numero: number;
  motivo: string;
  catalogo_hash: string;
  criado_em: Date;
};

export type StoredVersion = VersionSummary & { escolha: BuildChoice; pecas: Component[] };

const storedBomSchema = z.object({ escolha: buildChoiceSchema, pecas: z.array(z.unknown()) });

function versionValues(projetoId: string, numero: number, v: NewVersion, agora: Date) {
  const s = v.snapshot;
  return {
    projeto_id: projetoId,
    numero,
    motivo: v.motivo,
    catalogo_hash: v.catalogo_hash,
    intencao: v.pedido?.intencao ?? null,
    respostas: v.pedido?.respostas ?? null,
    opcoes: v.pedido?.opcoes ?? null,
    opcao_escolhida: v.pedido?.opcao_escolhida ?? s.escolha.faixa_origem ?? null,
    bom: { escolha: s.escolha, pecas: s.pecas },
    calculos: { validacao: s.validacao, metricas: s.metricas },
    dificuldade: s.dificuldade,
    custos: s.custos,
    locais: s.locais,
    alertas: s.alertas,
    cena: s.cena ?? null,
    criado_em: agora,
  };
}

export function createProject(
  db: Db,
  input: { titulo: string; prompt_original?: string; versao: NewVersion },
  agora = new Date(),
): string {
  const id = randomUUID();
  db.transaction((tx) => {
    tx.insert(projetos)
      .values({
        id,
        titulo: input.titulo,
        prompt_original: input.prompt_original ?? "",
        versao_atual: 1,
        criado_em: agora,
        atualizado_em: agora,
      })
      .run();
    tx.insert(versoesProjeto)
      .values(versionValues(id, 1, input.versao, agora))
      .run();
  });
  return id;
}

/** Acrescenta uma versão e a torna a atual. Devolve o número da versão nova. */
export function addVersion(
  db: Db,
  projetoId: string,
  versao: NewVersion,
  agora = new Date(),
): number {
  return db.transaction((tx) => {
    const projeto = tx.select().from(projetos).where(eq(projetos.id, projetoId)).get();
    if (!projeto) throw new Error(`projeto ${projetoId} não existe`);
    const ultima = tx
      .select({ numero: versoesProjeto.numero })
      .from(versoesProjeto)
      .where(eq(versoesProjeto.projeto_id, projetoId))
      .orderBy(desc(versoesProjeto.numero))
      .get();
    const numero = (ultima?.numero ?? 0) + 1;
    tx.insert(versoesProjeto)
      .values(versionValues(projetoId, numero, versao, agora))
      .run();
    tx.update(projetos)
      .set({ versao_atual: numero, atualizado_em: agora })
      .where(eq(projetos.id, projetoId))
      .run();
    return numero;
  });
}

export function getProject(db: Db, id: string) {
  return db.select().from(projetos).where(eq(projetos.id, id)).get();
}

export function renameProject(db: Db, id: string, titulo: string, agora = new Date()): boolean {
  const r = db
    .update(projetos)
    .set({ titulo, atualizado_em: agora })
    .where(eq(projetos.id, id))
    .run();
  return r.changes > 0;
}

export function deleteProject(db: Db, id: string): boolean {
  return db.delete(projetos).where(eq(projetos.id, id)).run().changes > 0;
}

export function listVersions(db: Db, projetoId: string): VersionSummary[] {
  return db
    .select({
      numero: versoesProjeto.numero,
      motivo: versoesProjeto.motivo,
      catalogo_hash: versoesProjeto.catalogo_hash,
      criado_em: versoesProjeto.criado_em,
    })
    .from(versoesProjeto)
    .where(eq(versoesProjeto.projeto_id, projetoId))
    .orderBy(desc(versoesProjeto.numero))
    .all();
}

/** Lê a escolha e a cópia das peças de uma versão (a atual, se `numero` não vier). */
export function getVersion(db: Db, projetoId: string, numero?: number): StoredVersion | undefined {
  const projeto = getProject(db, projetoId);
  if (!projeto) return undefined;
  const alvo = numero ?? projeto.versao_atual;
  const linha = db
    .select()
    .from(versoesProjeto)
    .where(and(eq(versoesProjeto.projeto_id, projetoId), eq(versoesProjeto.numero, alvo)))
    .get();
  if (!linha) return undefined;
  const bom = storedBomSchema.safeParse(linha.bom);
  if (!bom.success) return undefined;
  // Peça guardada que não passa mais no schema atual é ignorada: o catálogo atual vale primeiro.
  const pecas = bom.data.pecas.flatMap((p) => {
    const r = componentSchema.safeParse(p);
    return r.success ? [r.data] : [];
  });
  return {
    numero: linha.numero,
    motivo: linha.motivo,
    catalogo_hash: linha.catalogo_hash,
    criado_em: linha.criado_em,
    escolha: bom.data.escolha,
    pecas,
  };
}

/** Projetos do mais recente para o mais antigo, com o arquétipo e a faixa da versão atual. */
export function listProjects(db: Db): ProjectSummary[] {
  const lista = db.select().from(projetos).orderBy(desc(projetos.atualizado_em)).all();
  return lista.map((p) => {
    const versao = getVersion(db, p.id);
    return {
      id: p.id,
      titulo: p.titulo,
      versao_atual: p.versao_atual,
      criado_em: p.criado_em,
      atualizado_em: p.atualizado_em,
      arquetipo_id: versao?.escolha.arquetipo_id,
      faixa_origem: versao?.escolha.faixa_origem,
    };
  });
}
