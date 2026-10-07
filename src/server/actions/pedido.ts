"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { TIERS } from "@/domain/categories/drone/solver";
import { choiceFromBuild } from "@/domain/categories/drone/swap";
import type { Explanation } from "@/domain/categories/drone/pipeline/explain";
import { loadDroneCatalog, type LoadedCatalog } from "@/server/catalog/load";
import { type Db, getDb } from "@/server/db";
import {
  appAnalyzer,
  archetypePlans,
  explainChoice,
  findCard,
  pedidoSchema,
  type PipelineResult,
  runPipeline,
  selectableCards,
} from "@/server/pipeline/run";
import { logSafetyEvent } from "@/server/pipeline/safety-log";
import { snapshotFor, TIER_LABEL } from "@/server/project-view/view";
import { createProject } from "@/server/projects/repository";
import { assertLocalRequest, NotLocalError } from "@/server/security/local";
import { ownedTools } from "@/server/tools/owned";

/*
 * Ações do pedido em linguagem natural (/novo). São POST (server actions), só aceitas a partir do
 * próprio computador (assertLocalRequest): cada análise pode custar uma chamada paga à API.
 * O navegador manda só o texto, as respostas clicadas e a opção escolhida; todo o resto é
 * recalculado aqui (a análise da IA fica na memória, então refazer não custa outra chamada).
 */

export type PedidoResponse = { ok: true; resultado: PipelineResult } | { ok: false; erro: string };
export type ExplanationResponse =
  { ok: true; explicacao: Explanation } | { ok: false; erro: string };
export type CreateResponse = { ok: false; erro: string };

async function guard(): Promise<string | undefined> {
  try {
    await assertLocalRequest();
    return undefined;
  } catch (error) {
    if (error instanceof NotLocalError) return error.message;
    throw error;
  }
}

function usageSink(db: Db, loaded: LoadedCatalog) {
  // Sem câmbio no catálogo, o custo em R$ fica 0 (o custo em US$ continua registrado).
  return { db, cambioBrl: loaded.catalog.importacao?.cambio.usd_brl ?? 0 };
}

async function pipeline(
  pedido: unknown,
  respostas: unknown,
  tentarDeNovo: boolean,
): Promise<{ resultado: PipelineResult; loaded: LoadedCatalog; db: Db } | { erro: string }> {
  const texto = pedidoSchema.safeParse(pedido);
  if (!texto.success) return { erro: texto.error.issues[0]?.message ?? "Pedido inválido." };
  const loaded = loadDroneCatalog();
  const db = getDb();
  const resultado = await runPipeline(
    { pedido: texto.data, respostas },
    {
      loaded,
      analisar: appAnalyzer({ registro: usageSink(db, loaded), tentarDeNovo }),
      ferramentasQueTenho: ownedTools(db),
    },
  );
  return { resultado, loaded, db };
}

/** Analisa o pedido (ou refaz com as respostas clicadas) e devolve perguntas, opções ou recusa. */
export async function analyzeRequestAction(
  pedido: unknown,
  respostas: unknown,
): Promise<PedidoResponse> {
  const bloqueio = await guard();
  if (bloqueio) return { ok: false, erro: bloqueio };
  const novo =
    respostas === undefined ||
    respostas === null ||
    (typeof respostas === "object" && Object.keys(respostas).length === 0);
  const r = await pipeline(pedido, respostas, novo);
  if ("erro" in r) return { ok: false, erro: r.erro };
  // Registra uma vez por pedido enviado (os cliques nas perguntas não repetem o registro).
  if (novo) logSafetyEvent(r.db, r.resultado.pedido, r.resultado.seguranca);
  return { ok: true, resultado: r.resultado };
}

/** "Por que este drone": a IA explica a escolha das regras, sem números. */
export async function explainChoiceAction(
  pedido: unknown,
  respostas: unknown,
): Promise<ExplanationResponse> {
  const bloqueio = await guard();
  if (bloqueio) return { ok: false, erro: bloqueio };
  const r = await pipeline(pedido, respostas, false);
  if ("erro" in r) return { ok: false, erro: r.erro };
  if (r.resultado.tipo !== "opcoes") return { ok: false, erro: "Não há escolha para explicar." };
  const explicacao = await explainChoice(r.resultado, { registro: usageSink(r.db, r.loaded) });
  return { ok: true, explicacao };
}

const escolhaSchema = z.object({
  arquetipo_id: z.string().min(1).max(64),
  faixa: z.enum(TIERS),
});

function titleFrom(pedido: string): string {
  const limpo = pedido.replace(/\s+/g, " ").trim();
  const curto = limpo.length > 80 ? `${limpo.slice(0, 77).trimEnd()}...` : limpo;
  return curto.charAt(0).toUpperCase() + curto.slice(1);
}

/** Cria o projeto com a opção escolhida (versão 1, com o pedido guardado) e abre a página dele. */
export async function createProjectFromRequestAction(
  pedido: unknown,
  respostas: unknown,
  escolha: unknown,
): Promise<CreateResponse> {
  const bloqueio = await guard();
  if (bloqueio) return { ok: false, erro: bloqueio };
  const opcao = escolhaSchema.safeParse(escolha);
  if (!opcao.success) return { ok: false, erro: "Opção inválida." };
  const r = await pipeline(pedido, respostas, false);
  if ("erro" in r) return { ok: false, erro: r.erro };
  const { resultado, loaded, db } = r;
  if (resultado.tipo === "recusa" || resultado.tipo === "perguntas") {
    return { ok: false, erro: "Este pedido ainda não tem opções para escolher." };
  }
  const { arquetipo_id, faixa } = opcao.data;
  const cartao = findCard(resultado, arquetipo_id, faixa);
  if (!cartao) {
    return {
      ok: false,
      erro: "Essa opção não está mais entre as mostradas. Analise o pedido de novo.",
    };
  }
  const owned = ownedTools(db);
  const plano = archetypePlans(loaded, resultado.intencao, resultado.respostas, undefined, owned)
    .find((p) => p.id === arquetipo_id)
    ?.faixas.find((t) => t.faixa === faixa);
  if (!plano)
    return { ok: false, erro: "Não foi possível montar essa opção com o catálogo atual." };
  const calculado = snapshotFor(choiceFromBuild(plano.report.build, faixa), {
    loaded,
    ferramentasQueTenho: owned,
  });
  if ("erro" in calculado) return { ok: false, erro: calculado.erro };

  const id = createProject(db, {
    titulo: titleFrom(resultado.pedido),
    prompt_original: resultado.pedido,
    versao: {
      motivo: `Criado a partir do pedido: ${cartao.arquetipo_nome}, faixa ${TIER_LABEL[faixa].toLowerCase()}`,
      catalogo_hash: loaded.hash,
      snapshot: calculado.snapshot,
      pedido: {
        intencao: resultado.intencao,
        respostas: resultado.respostas,
        opcoes: {
          modo: resultado.modo,
          tipo: resultado.tipo,
          motivos: resultado.tipo === "opcoes" ? resultado.motivos : [],
          suposicoes: resultado.suposicoes,
          cartoes: selectableCards(resultado),
        },
        opcao_escolhida: `${arquetipo_id}:${faixa}`,
      },
    },
  });
  redirect(`/projetos/${id}`);
}
