"use server";

import { z } from "zod";

import { loadDroneCatalog } from "@/server/catalog/load";
import { getDb } from "@/server/db";
import { applyGuideAction, type GuideResult } from "@/server/guide/service";
import { assertLocalRequest, NotLocalError } from "@/server/security/local";

/*
 * Ações do guia de montagem (SPEC B.13): confirmar o checklist de segurança, marcar um passo como
 * feito ou pendente e recomeçar. Só do próprio computador, com a entrada validada com zod; as
 * regras de segurança são conferidas no servidor (guide/service.ts), não no navegador.
 */

const idSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

const acaoSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("confirmar"),
    passo_id: idSchema,
    marcados: z.array(z.string().max(500)).max(30),
  }),
  z.object({ tipo: z.literal("feito"), passo_id: idSchema }),
  z.object({ tipo: z.literal("desfazer"), passo_id: idSchema }),
  z.object({ tipo: z.literal("recomecar") }),
]);

export async function guideAction(projetoId: unknown, acao: unknown): Promise<GuideResult> {
  try {
    await assertLocalRequest();
  } catch (error) {
    if (error instanceof NotLocalError) return { ok: false, erro: error.message };
    throw error;
  }
  const id = z.uuid().safeParse(projetoId);
  const parsed = acaoSchema.safeParse(acao);
  if (!id.success || !parsed.success) return { ok: false, erro: "Pedido inválido." };
  return applyGuideAction(getDb(), loadDroneCatalog(), id.data, parsed.data);
}
