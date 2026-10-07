import { desc } from "drizzle-orm";

import type { Db } from "@/server/db";
import { eventosSeguranca } from "@/server/db/schema";

import type { SafetyRecord } from "./run";

/*
 * Registro de segurança (SPEC B.9: "registre todo bloqueio ou alerta em SafetyEvent"). Pedido
 * permitido sem alertas não é registrado. Fica só no banco local do computador do dono.
 */

export function logSafetyEvent(
  db: Db,
  pedido: string,
  seguranca: SafetyRecord,
  projetoId?: string,
): void {
  if (seguranca.classificacao === "permitido") return;
  try {
    db.insert(eventosSeguranca)
      .values({
        origem: "prompt",
        texto: pedido.slice(0, 2000),
        classificacao: seguranca.classificacao,
        categorias: seguranca.categorias,
        motivo: `${seguranca.motivo} (${seguranca.origem})`,
        acao: seguranca.classificacao === "bloqueado" ? "recusado" : "alertas_mostrados",
        projeto_id: projetoId ?? null,
        criado_em: new Date(),
      })
      .run();
  } catch (error) {
    // O registro não pode derrubar a resposta para a pessoa.
    console.error("Não foi possível gravar o evento de segurança:", error);
  }
}

export function recentSafetyEvents(db: Db, limite = 20) {
  return db.select().from(eventosSeguranca).orderBy(desc(eventosSeguranca.id)).limit(limite).all();
}
