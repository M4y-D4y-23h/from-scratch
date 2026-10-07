import { eq, sql } from "drizzle-orm";

import type { StepProgress, StepStatus } from "@/domain/categories/drone/guide";
import type { Db } from "@/server/db";
import { progressoPassos } from "@/server/db/schema";

/*
 * Progresso no guia de montagem (SPEC B.13: "o progresso é salvo por projeto"). Fica fora das
 * versões: marcar um passo não muda o projeto. As regras (checklist antes de passo crítico, sem
 * pular passos críticos) ficam no domínio (guide.ts) e são conferidas pelas ações antes de gravar.
 */

export function getProgress(db: Db, projetoId: string): StepProgress[] {
  return db
    .select()
    .from(progressoPassos)
    .where(eq(progressoPassos.projeto_id, projetoId))
    .all()
    .map((p) => ({
      passo_id: p.passo_id,
      status: p.status,
      checkpoint_confirmado_em: p.checkpoint_confirmado_em?.toISOString(),
    }));
}

function upsert(
  db: Db,
  projetoId: string,
  passoId: string,
  valores: { status: StepStatus; checkpoint_confirmado_em: Date | null },
  agora: Date,
) {
  db.insert(progressoPassos)
    .values({ projeto_id: projetoId, passo_id: passoId, ...valores, atualizado_em: agora })
    .onConflictDoUpdate({
      target: [progressoPassos.projeto_id, progressoPassos.passo_id],
      set: { ...valores, atualizado_em: agora },
    })
    .run();
}

/** Checklist de segurança confirmado (o passo continua pendente até ser marcado como feito). */
export function confirmCheckpoint(db: Db, projetoId: string, passoId: string, agora = new Date()) {
  const atual = getProgress(db, projetoId).find((p) => p.passo_id === passoId);
  upsert(
    db,
    projetoId,
    passoId,
    { status: atual?.status ?? "pendente", checkpoint_confirmado_em: agora },
    agora,
  );
}

/**
 * Marca como feito ou volta para pendente. Voltar apaga a confirmação do checklist: para refazer
 * um passo crítico, a pessoa confere tudo de novo (segurança primeiro).
 */
export function setStepStatus(
  db: Db,
  projetoId: string,
  passoId: string,
  status: StepStatus,
  agora = new Date(),
) {
  const atual = getProgress(db, projetoId).find((p) => p.passo_id === passoId);
  const confirmado = atual?.checkpoint_confirmado_em;
  upsert(
    db,
    projetoId,
    passoId,
    {
      status,
      checkpoint_confirmado_em: status === "feito" && confirmado ? new Date(confirmado) : null,
    },
    agora,
  );
}

/** Recomeça o guia do zero. */
export function resetProgress(db: Db, projetoId: string): void {
  db.delete(progressoPassos).where(eq(progressoPassos.projeto_id, projetoId)).run();
}

/** Quantos passos cada projeto já marcou como feitos (para a lista de projetos). */
export function doneCounts(db: Db): Map<string, number> {
  const linhas = db
    .select({ projeto_id: progressoPassos.projeto_id, feitos: sql<number>`count(*)` })
    .from(progressoPassos)
    .where(eq(progressoPassos.status, "feito"))
    .groupBy(progressoPassos.projeto_id)
    .all();
  return new Map(linhas.map((l) => [l.projeto_id, Number(l.feitos)]));
}

/**
 * Volta para pendente (e apaga a confirmação do checklist) os passos já feitos ou confirmados
 * desta lista. Devolve quantos voltaram.
 */
export function reopenSteps(
  db: Db,
  projetoId: string,
  passoIds: readonly string[],
  agora = new Date(),
): number {
  const alvo = new Set(passoIds);
  const afetados = getProgress(db, projetoId).filter(
    (p) => alvo.has(p.passo_id) && (p.status === "feito" || p.checkpoint_confirmado_em),
  );
  for (const p of afetados) setStepStatus(db, projetoId, p.passo_id, "pendente", agora);
  return afetados.length;
}
