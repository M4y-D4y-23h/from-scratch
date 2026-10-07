"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { slotLabel } from "@/domain/categories/drone/bom";
import { TIERS, slotCandidates } from "@/domain/categories/drone/solver";
import {
  applySwaps,
  type BuildChoice,
  choiceFromBuild,
  type SlotSwap,
} from "@/domain/categories/drone/swap";
import type { Archetype, Component } from "@/domain/categories/drone/schema";
import { loadDroneCatalog, type LoadedCatalog } from "@/server/catalog/load";
import { getDb } from "@/server/db";
import { referenceBuild, snapshotFor, TIER_LABEL } from "@/server/project-view/view";
import {
  addVersion,
  createProject,
  deleteProject,
  getProject,
  getVersion,
  renameProject,
} from "@/server/projects/repository";
import { assertLocalRequest, NotLocalError } from "@/server/security/local";
import { ownedTools, setToolOwned } from "@/server/tools/owned";

/*
 * Ações da página do projeto (trocar peça, versões, "já tenho"). Cada uma confere que o pedido
 * veio do próprio computador, valida a entrada com zod e recalcula tudo no servidor com o motor
 * de cálculo: o navegador só diz QUAL peça, nunca os números.
 */

export type ActionResult = { ok: true; mensagem: string } | { ok: false; erro: string };

const swapsSchema = z
  .array(
    z.object({
      slot: z.string().min(1).max(64),
      componente_id: z.string().min(1).max(128).nullable(),
    }),
  )
  .min(1)
  .max(5);

const nameOf = (c: { marca: string; modelo: string }) => `${c.marca} ${c.modelo}`;

async function guard(): Promise<ActionResult | undefined> {
  try {
    await assertLocalRequest();
    return undefined;
  } catch (error) {
    if (error instanceof NotLocalError) return { ok: false, erro: error.message };
    throw error;
  }
}

/** Confere que cada peça existe e cabe no slot (o navegador pode mandar qualquer id). */
function checkSwaps(
  swaps: readonly SlotSwap[],
  archetype: Archetype,
  loaded: LoadedCatalog,
): string | undefined {
  for (const s of swaps) {
    const def = archetype.slots.find((x) => x.slot === s.slot);
    if (!def) return `O slot "${s.slot}" não existe neste projeto.`;
    if (s.componente_id === null) {
      if (def.obrigatorio) return `O slot "${slotLabel(archetype, s.slot)}" não pode ficar vazio.`;
      continue;
    }
    if (!slotCandidates(def, loaded.catalog).some((c) => c.id === s.componente_id)) {
      return `A peça "${s.componente_id}" não existe no catálogo ou não cabe em "${slotLabel(archetype, s.slot)}".`;
    }
  }
  return undefined;
}

/** "Trocou a FC: Pixhawk 6C Mini → Pixhawk 6C" (para o histórico de versões). */
function describeSwaps(
  swaps: readonly SlotSwap[],
  antes: BuildChoice,
  archetype: Archetype,
  componentes: readonly Component[],
): string {
  const nome = (id: string | null | undefined) => {
    if (!id) return "nenhuma";
    const c = componentes.find((x) => x.id === id);
    return c ? nameOf(c) : id;
  };
  return swaps
    .map((s) => {
      const anterior = antes.itens.find((i) => i.slot === s.slot)?.componente_id;
      return `${slotLabel(archetype, s.slot)}: ${nome(anterior)} → ${nome(s.componente_id)}`;
    })
    .join("; ");
}

type Prepared =
  | { erro: string }
  | {
      escolha: BuildChoice;
      snapshot: Extract<ReturnType<typeof snapshotFor>, { snapshot: unknown }>["snapshot"];
      motivo: string;
    };

/** Aplica as trocas, recalcula e recusa o que deixaria o projeto bloqueado. */
function prepareSwap(
  base: BuildChoice,
  archetype: Archetype,
  bruto: unknown,
  loaded: LoadedCatalog,
  owned: ReadonlySet<string>,
): Prepared {
  const parsed = swapsSchema.safeParse(bruto);
  if (!parsed.success) return { erro: "Troca inválida." };
  const problema = checkSwaps(parsed.data, archetype, loaded);
  if (problema) return { erro: problema };
  const escolha = applySwaps(base, archetype, parsed.data);
  const calculado = snapshotFor(escolha, { loaded, ferramentasQueTenho: owned });
  if ("erro" in calculado) return { erro: calculado.erro };
  const { validacao } = calculado.report;
  if (validacao.bloqueado) {
    const falhas = validacao.resultados
      .filter((r) => r.status === "falhou" && r.severidade === "bloqueante")
      .map((r) => r.titulo);
    return { erro: `Essa troca deixaria o projeto bloqueado: ${falhas.join("; ")}.` };
  }
  return {
    escolha,
    snapshot: calculado.snapshot,
    motivo: `Troca de peça: ${describeSwaps(parsed.data, base, archetype, loaded.catalog.componentes)}`,
  };
}

/**
 * Troca peças num build de referência: cria "o seu projeto" (versão 1 = referência, versão 2 =
 * com a troca) e abre a página dele. O build de referência continua intacto.
 */
export async function swapOnReferenceAction(
  arquetipoId: string,
  faixa: string,
  trocas: unknown,
): Promise<ActionResult> {
  const bloqueio = await guard();
  if (bloqueio) return bloqueio;
  const tier = TIERS.find((t) => t === faixa);
  if (!tier) return { ok: false, erro: "Faixa inválida." };
  const loaded = loadDroneCatalog();
  const db = getDb();
  const owned = ownedTools(db);
  const ref = referenceBuild(loaded, arquetipoId, tier);
  if (!ref) return { ok: false, erro: "Build de referência não encontrado." };
  const base = choiceFromBuild(ref.build, tier);
  const original = snapshotFor(base, { loaded, ferramentasQueTenho: owned });
  if ("erro" in original) return { ok: false, erro: original.erro };
  const trocado = prepareSwap(base, ref.archetype, trocas, loaded, owned);
  if ("erro" in trocado) return { ok: false, erro: trocado.erro };
  const id = createProject(db, {
    titulo: `Meu projeto: ${ref.archetype.nome}`,
    versao: {
      motivo: `Build de referência, faixa ${TIER_LABEL[tier].toLowerCase()}`,
      catalogo_hash: loaded.hash,
      snapshot: original.snapshot,
    },
  });
  addVersion(db, id, {
    motivo: trocado.motivo,
    catalogo_hash: loaded.hash,
    snapshot: trocado.snapshot,
  });
  redirect(`/projetos/${id}?aba=pecas`);
}

/**
 * "Começar a montar" num build de referência: cria o seu projeto (versão 1 = referência), onde o
 * progresso do guia fica salvo, e abre a aba Montagem.
 */
export async function startFromReferenceAction(
  arquetipoId: string,
  faixa: string,
): Promise<ActionResult> {
  const bloqueio = await guard();
  if (bloqueio) return bloqueio;
  const tier = TIERS.find((t) => t === faixa);
  if (!tier) return { ok: false, erro: "Faixa inválida." };
  const loaded = loadDroneCatalog();
  const db = getDb();
  const ref = referenceBuild(loaded, arquetipoId, tier);
  if (!ref) return { ok: false, erro: "Build de referência não encontrado." };
  const calculado = snapshotFor(choiceFromBuild(ref.build, tier), {
    loaded,
    ferramentasQueTenho: ownedTools(db),
  });
  if ("erro" in calculado) return { ok: false, erro: calculado.erro };
  const id = createProject(db, {
    titulo: `Meu projeto: ${ref.archetype.nome}`,
    versao: {
      motivo: `Build de referência, faixa ${TIER_LABEL[tier].toLowerCase()}`,
      catalogo_hash: loaded.hash,
      snapshot: calculado.snapshot,
    },
  });
  redirect(`/projetos/${id}?aba=montagem`);
}

/** Troca peças num projeto salvo: nova versão, página atualizada. */
export async function swapOnProjectAction(
  projetoId: string,
  trocas: unknown,
): Promise<ActionResult> {
  const bloqueio = await guard();
  if (bloqueio) return bloqueio;
  const db = getDb();
  const atual = getVersion(db, projetoId);
  if (!atual) return { ok: false, erro: "Projeto não encontrado." };
  const loaded = loadDroneCatalog();
  const archetype = loaded.catalog.arquetipos.find((a) => a.id === atual.escolha.arquetipo_id);
  if (!archetype) return { ok: false, erro: "O arquétipo deste projeto saiu do catálogo." };
  const trocado = prepareSwap(atual.escolha, archetype, trocas, loaded, ownedTools(db));
  if ("erro" in trocado) return { ok: false, erro: trocado.erro };
  const numero = addVersion(db, projetoId, {
    motivo: trocado.motivo,
    catalogo_hash: loaded.hash,
    snapshot: trocado.snapshot,
  });
  refresh();
  return { ok: true, mensagem: `Versão ${numero} salva. Tudo foi recalculado com a peça nova.` };
}

/** Volta para uma versão antiga criando uma versão nova igual a ela (o histórico não se perde). */
export async function restoreVersionAction(
  projetoId: string,
  numero: number,
): Promise<ActionResult> {
  const bloqueio = await guard();
  if (bloqueio) return bloqueio;
  if (!Number.isInteger(numero) || numero < 1) return { ok: false, erro: "Versão inválida." };
  const db = getDb();
  const antiga = getVersion(db, projetoId, numero);
  if (!antiga) return { ok: false, erro: "Versão não encontrada." };
  const loaded = loadDroneCatalog();
  const calculado = snapshotFor(antiga.escolha, { loaded, ferramentasQueTenho: ownedTools(db) });
  if ("erro" in calculado) return { ok: false, erro: calculado.erro };
  addVersion(db, projetoId, {
    motivo: `Voltou para a versão ${numero}`,
    catalogo_hash: loaded.hash,
    snapshot: calculado.snapshot,
  });
  redirect(`/projetos/${projetoId}`);
}

export async function renameProjectAction(
  projetoId: string,
  titulo: unknown,
): Promise<ActionResult> {
  const bloqueio = await guard();
  if (bloqueio) return bloqueio;
  const parsed = z.string().trim().min(1).max(120).safeParse(titulo);
  if (!parsed.success) return { ok: false, erro: "Use um nome de 1 a 120 letras." };
  if (!renameProject(getDb(), projetoId, parsed.data)) {
    return { ok: false, erro: "Projeto não encontrado." };
  }
  refresh();
  return { ok: true, mensagem: "Nome salvo." };
}

export async function deleteProjectAction(projetoId: string): Promise<ActionResult> {
  const bloqueio = await guard();
  if (bloqueio) return bloqueio;
  const db = getDb();
  if (!getProject(db, projetoId)) return { ok: false, erro: "Projeto não encontrado." };
  deleteProject(db, projetoId);
  redirect("/");
}

/** "Já tenho esta ferramenta" (vale para todos os projetos). */
export async function setToolOwnedAction(
  ferramentaId: string,
  tenho: boolean,
): Promise<ActionResult> {
  const bloqueio = await guard();
  if (bloqueio) return bloqueio;
  const { catalog } = loadDroneCatalog();
  const ferramenta = catalog.ferramentas.find((t) => t.id === ferramentaId);
  if (!ferramenta || typeof tenho !== "boolean") return { ok: false, erro: "Ferramenta inválida." };
  setToolOwned(getDb(), ferramentaId, tenho);
  refresh();
  return {
    ok: true,
    mensagem: tenho
      ? `${ferramenta.nome}: marcada como "já tenho" (saiu do custo).`
      : `${ferramenta.nome}: volta a entrar no custo.`,
  };
}
