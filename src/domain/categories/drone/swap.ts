import { z } from "zod";

import type { CentsRange } from "@/domain/core/money";
import type { RuleResult, ValidationReport } from "@/domain/core/validation";
import type { VerificationStatus } from "@/domain/core/verification";

import { slotLabel } from "./bom";
import { type Build, type BuildItem, TELEMETRY_OPTIONS, type Tier } from "./build";
import type { DroneCatalog } from "./catalog";
import { type BuildMetrics, validateBuild } from "./compatibility";
import type { DroneConfig } from "./config";
import { computeCosts, type CostReport } from "./costs";
import type { Archetype, Component } from "./schema";
import { finalizeBuild, slotCandidates } from "./solver";

/*
 * Trocar peça com revalidação (SPEC B.12 e aceite da Fase 3).
 *
 * O projeto guarda só o que a pessoa ESCOLHEU (slot → peça e quantidades), não o que é derivado:
 * kits, peças que vêm na caixa de outras e a telemetria padrão são recalculados a cada versão
 * pelas mesmas funções do solver. Assim uma troca nunca deixa um kit "fantasma" no projeto.
 *
 * Alternativas de um slot: todas as peças do catálogo que cabem no slot (de qualquer faixa), cada
 * uma validada com as regras do arquétipo. Só as que não falham em regra bloqueante são
 * oferecidas; as outras aparecem à parte com o motivo, para a pessoa entender por que não servem.
 */

const TIER_VALUES = ["economica", "equilibrada", "premium"] as const;

export const buildChoiceSchema = z.object({
  arquetipo_id: z.string().min(1),
  /** Faixa do build de referência de onde o projeto saiu (quantidade de compra padrão). */
  faixa_origem: z.enum(TIER_VALUES).optional(),
  itens: z.array(
    z.object({
      slot: z.string().min(1),
      componente_id: z.string().min(1),
      quantidade_no_drone: z.int().min(0),
      quantidade_compra: z.int().min(0),
    }),
  ),
  opcoes: z.object({
    telemetria: z.enum(TELEMETRY_OPTIONS),
    controle: z.enum(["radio", "celular_experimental"]),
    celular: z.enum(["android", "ios", "desconhecido"]),
    uso: z.enum(["recreativo", "nao_recreativo"]),
    oculos_fpv: z.boolean(),
  }),
  /** A telemetria segue o padrão do ADR-0017 e é recalculada quando rádio ou receptor mudam. */
  telemetria_automatica: z.boolean().default(true),
});
export type BuildChoice = z.infer<typeof buildChoiceSchema>;

/** O que foi escolhido num build (sem kits, que são derivados). */
export function choiceFromBuild(
  build: Build,
  faixa?: Tier,
  telemetriaAutomatica = true,
): BuildChoice {
  return {
    arquetipo_id: build.arquetipo_id,
    faixa_origem: faixa,
    itens: build.itens
      .filter((i) => !i.slot.startsWith("kit:"))
      .map((i) => ({
        slot: i.slot,
        componente_id: i.componente.id,
        quantidade_no_drone: i.quantidade_no_drone,
        quantidade_compra: i.quantidade_compra,
      })),
    opcoes: { ...build.opcoes },
    telemetria_automatica: telemetriaAutomatica,
  };
}

export type MaterializeResult =
  | { build: Build; faltando: string[]; descartado?: undefined }
  | { build?: undefined; faltando: string[]; descartado: string };

/**
 * Monta o build de uma escolha com as peças do catálogo. `reserva` são cópias guardadas na versão
 * do projeto: se uma peça saiu do catálogo, a cópia guardada é usada (e listada em `faltando`).
 */
export function materializeChoice(
  choice: BuildChoice,
  archetype: Archetype,
  catalog: DroneCatalog,
  reserva: readonly Component[] = [],
): MaterializeResult {
  const doCatalogo = new Map(catalog.componentes.map((c) => [c.id, c]));
  const guardadas = new Map(reserva.map((c) => [c.id, c]));
  const faltando: string[] = [];
  const semCopia: string[] = [];
  const itens: BuildItem[] = [];
  for (const item of choice.itens) {
    const componente = doCatalogo.get(item.componente_id) ?? guardadas.get(item.componente_id);
    if (!doCatalogo.has(item.componente_id)) faltando.push(item.componente_id);
    if (!componente) {
      semCopia.push(item.componente_id);
      continue;
    }
    itens.push({
      slot: item.slot,
      componente,
      quantidade_no_drone: item.quantidade_no_drone,
      quantidade_compra: item.quantidade_compra,
    });
  }
  if (semCopia.length > 0) {
    return {
      faltando,
      descartado: `Peças que não existem no catálogo: ${semCopia.join(", ")}.`,
    };
  }
  const rascunho: Build = { arquetipo_id: choice.arquetipo_id, itens, opcoes: choice.opcoes };
  const final = finalizeBuild(
    rascunho,
    archetype,
    catalog,
    choice.telemetria_automatica ? undefined : choice.opcoes.telemetria,
  );
  if (!final.build) return { faltando, descartado: final.descartado };
  return { build: final.build, faltando };
}

/** Troca (ou tira, com `null`) a peça de um slot, mantendo as quantidades do slot. */
export function swapInChoice(
  choice: BuildChoice,
  archetype: Archetype,
  slot: string,
  componenteId: string | null,
): BuildChoice {
  const def = archetype.slots.find((s) => s.slot === slot);
  if (!def) throw new Error(`slot "${slot}" não existe no arquétipo ${archetype.id}`);
  if (componenteId === null) {
    if (def.obrigatorio) throw new Error(`o slot "${slot}" é obrigatório`);
    return { ...choice, itens: choice.itens.filter((i) => i.slot !== slot) };
  }
  const atual = choice.itens.find((i) => i.slot === slot);
  if (atual) {
    return {
      ...choice,
      itens: choice.itens.map((i) => (i.slot === slot ? { ...i, componente_id: componenteId } : i)),
    };
  }
  const compra =
    (choice.faixa_origem && def.compra_por_faixa?.[choice.faixa_origem]) ?? def.quantidade;
  return {
    ...choice,
    itens: [
      ...choice.itens,
      {
        slot,
        componente_id: componenteId,
        quantidade_no_drone: def.quantidade,
        quantidade_compra: compra,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Alternativas de um slot
// ---------------------------------------------------------------------------

/** O estado atual do projeto, para comparar cada alternativa com ele. */
export type ProjectState = {
  build: Build;
  validacao: ValidationReport;
  metricas: BuildMetrics;
  custos: CostReport;
};

/** Uma troca: a peça nova de um slot (null = tirar a peça de um slot opcional). */
export type SlotSwap = { slot: string; componente_id: string | null };

export type SwapDelta = {
  /** Novo total das peças menos o atual (pode ser negativo). */
  custo_pecas: { min_centavos: number; max_centavos: number };
  massa_g?: number;
  twr: { antes?: number; depois?: number };
  voo_max_min: { antes?: number; depois?: number };
  pairar_pct: { antes?: number; depois?: number };
};

/** Resultado de validar o projeto com uma ou mais trocas. */
export type SwapEvaluation = {
  compativel: boolean;
  /** Compatível, mas alguma regra bloqueante ficou sem dado para confirmar. */
  incompleto: boolean;
  /** Por que não serve (regras bloqueantes que falharam ou motivo de compra). */
  motivos: string[];
  /** Regras bloqueantes que passam a ficar sem dado com a troca. */
  sem_dado_novos: string[];
  /** Avisos (regras de alerta) que passam a aparecer com a troca. */
  alertas_novos: string[];
  /** Avisos que deixam de aparecer. */
  alertas_resolvidos: string[];
  delta: SwapDelta;
  /** Projeto trocado (ausente se a combinação nem pôde ser montada). */
  novo?: ProjectState;
};

/** Troca extra que torna uma peça incompatível utilizável (ex.: frame novo pede hélice maior). */
export type SwapSuggestion = {
  trocas: Array<{ slot: string; rotulo: string; componente_id: string; nome: string }>;
  avaliacao: Omit<SwapEvaluation, "novo">;
};

export type SwapCandidate = Omit<SwapEvaluation, "novo"> & {
  /** null = tirar a peça (slot opcional). */
  componente_id: string | null;
  nome: string;
  descricao_leiga: string;
  selo: VerificationStatus;
  /** Faixas em que o curador recomenda a peça (vazio = todas). */
  faixas: Tier[];
  /** Custo da linha da peça no projeto trocado. */
  preco?: CentsRange;
  /** Vem na caixa de outro produto do projeto (não custa à parte). */
  vem_com?: string;
  /** Para peças incompatíveis: uma troca a mais que resolve. */
  sugestao?: SwapSuggestion;
};

export type SlotAlternatives = {
  slot: string;
  rotulo: string;
  opcional: boolean;
  atual?: { componente_id: string; nome: string };
  compativeis: SwapCandidate[];
  incompativeis: SwapCandidate[];
};

export type AlternativesInput = {
  choice: BuildChoice;
  archetype: Archetype;
  catalog: DroneCatalog;
  config: DroneConfig;
  ferramentasQueTenho?: ReadonlySet<string>;
  atual: ProjectState;
};

const nameOf = (c: { marca: string; modelo: string }) => `${c.marca} ${c.modelo}`;
const midpoint = (d: SwapDelta) => (d.custo_pecas.min_centavos + d.custo_pecas.max_centavos) / 2;

function failing(report: ValidationReport, severidade: RuleResult["severidade"]): RuleResult[] {
  return report.resultados.filter((r) => r.status === "falhou" && r.severidade === severidade);
}

function missing(report: ValidationReport): RuleResult[] {
  return report.resultados.filter((r) => r.status === "sem_dado" && r.severidade === "bloqueante");
}

function delta(atual: ProjectState, novo: ProjectState): SwapDelta {
  const massaAntes = atual.metricas.auw.massa_total_g;
  const massaDepois = novo.metricas.auw.massa_total_g;
  return {
    custo_pecas: {
      min_centavos: novo.custos.total_pecas.min_centavos - atual.custos.total_pecas.min_centavos,
      max_centavos: novo.custos.total_pecas.max_centavos - atual.custos.total_pecas.max_centavos,
    },
    massa_g:
      massaAntes !== undefined && massaDepois !== undefined ? massaDepois - massaAntes : undefined,
    twr: { antes: atual.metricas.propulsion.twr, depois: novo.metricas.propulsion.twr },
    voo_max_min: {
      antes: atual.metricas.flight.max_minutos,
      depois: novo.metricas.flight.max_minutos,
    },
    pairar_pct: {
      antes: atual.metricas.propulsion.hover?.throttle_pct,
      depois: novo.metricas.propulsion.hover?.throttle_pct,
    },
  };
}

const EMPTY_DELTA: SwapDelta = {
  custo_pecas: { min_centavos: 0, max_centavos: 0 },
  twr: {},
  voo_max_min: {},
  pairar_pct: {},
};

/** Aplica várias trocas a uma escolha. */
export function applySwaps(
  choice: BuildChoice,
  archetype: Archetype,
  swaps: readonly SlotSwap[],
): BuildChoice {
  return swaps.reduce((c, s) => swapInChoice(c, archetype, s.slot, s.componente_id), choice);
}

/** Valida o projeto com as trocas e compara com o atual. */
export function evaluateSwaps(
  input: AlternativesInput,
  swaps: readonly SlotSwap[],
): SwapEvaluation {
  const { archetype, catalog, config, atual } = input;
  const montado = materializeChoice(applySwaps(input.choice, archetype, swaps), archetype, catalog);
  if (!montado.build) {
    return {
      compativel: false,
      incompleto: false,
      motivos: [montado.descartado],
      sem_dado_novos: [],
      alertas_novos: [],
      alertas_resolvidos: [],
      delta: EMPTY_DELTA,
    };
  }
  const profile = catalog.perfis_firmware.find((p) => p.id === archetype.perfil_firmware);
  const { report, metrics } = validateBuild({
    build: montado.build,
    archetype,
    thrustTables: catalog.empuxo,
    config,
    firmwareProfile: profile,
  });
  const custos = computeCosts(montado.build, archetype, catalog, input.ferramentasQueTenho);
  const novo: ProjectState = { build: montado.build, validacao: report, metricas: metrics, custos };
  const alertasAntes = new Set(failing(atual.validacao, "alerta").map((r) => r.regra_id));
  const alertasDepois = failing(report, "alerta");
  const idsDepois = new Set(alertasDepois.map((r) => r.regra_id));
  const semDadoAntes = new Set(missing(atual.validacao).map((r) => r.regra_id));
  return {
    compativel: !report.bloqueado,
    incompleto: report.incompleto,
    motivos: failing(report, "bloqueante").map((r) => r.titulo),
    sem_dado_novos: missing(report)
      .filter((r) => !semDadoAntes.has(r.regra_id))
      .map((r) => r.titulo),
    alertas_novos: alertasDepois.filter((r) => !alertasAntes.has(r.regra_id)).map((r) => r.titulo),
    alertas_resolvidos: failing(atual.validacao, "alerta")
      .filter((r) => !idsDepois.has(r.regra_id))
      .map((r) => r.titulo),
    delta: delta(atual, novo),
    novo,
  };
}

/** Sem o projeto montado (não vai para a interface). */
function summary(e: SwapEvaluation): Omit<SwapEvaluation, "novo"> {
  return {
    compativel: e.compativel,
    incompleto: e.incompleto,
    motivos: e.motivos,
    sem_dado_novos: e.sem_dado_novos,
    alertas_novos: e.alertas_novos,
    alertas_resolvidos: e.alertas_resolvidos,
    delta: e.delta,
  };
}

/** Melhor entre duas avaliações compatíveis: completa primeiro, depois a mais barata. */
function better(a: SwapEvaluation, b: SwapEvaluation): boolean {
  if (a.incompleto !== b.incompleto) return !a.incompleto;
  return midpoint(a.delta) < midpoint(b.delta);
}

type ExtraSwap = { swap: SlotSwap; nome: string };

/** Slots das peças citadas pelas regras, fora dos que já foram trocados (e dos kits). */
function slotsOfRules(
  estado: ProjectState,
  regras: readonly RuleResult[],
  fora: ReadonlySet<string>,
): string[] {
  const envolvidas = new Set(regras.flatMap((r) => r.componentes ?? []));
  return [
    ...new Set(
      estado.build.itens
        .filter(
          (i) => envolvidas.has(i.componente.id) && !fora.has(i.slot) && !i.slot.startsWith("kit:"),
        )
        .map((i) => i.slot),
    ),
  ];
}

/** A melhor troca a mais (entre os slots dados) que deixa o projeto sem falha bloqueante. */
function bestExtra(
  input: AlternativesInput,
  anteriores: readonly ExtraSwap[],
  slots: readonly string[],
): { trocas: ExtraSwap[]; avaliacao: SwapEvaluation } | undefined {
  let melhor: { trocas: ExtraSwap[]; avaliacao: SwapEvaluation } | undefined;
  for (const outro of slots) {
    const def = input.archetype.slots.find((s) => s.slot === outro);
    if (!def) continue;
    const atualId = input.choice.itens.find((i) => i.slot === outro)?.componente_id;
    for (const c of slotCandidates(def, input.catalog)) {
      if (c.id === atualId) continue;
      const trocas = [
        ...anteriores,
        { swap: { slot: outro, componente_id: c.id }, nome: nameOf(c) },
      ];
      const e = evaluateSwaps(
        input,
        trocas.map((t) => t.swap),
      );
      if (!e.compativel) continue;
      if (!melhor || better(e, melhor.avaliacao)) melhor = { trocas, avaliacao: e };
    }
  }
  return melhor;
}

/**
 * Para uma peça que não serve sozinha: procura UMA troca a mais, nos slots das peças envolvidas
 * nas regras bloqueantes que falharam, que deixe o projeto sem falha bloqueante (ex.: o frame de
 * 75 mm pede a hélice de 40 mm). Se o resultado ficar sem dado (ex.: não há tabela de empuxo do
 * motor atual com a hélice nova), tenta mais uma troca nos slots das regras sem dado (o motor que
 * tem tabela publicada). Busca pequena e guiada pelas regras, para caber no tempo da página.
 */
function suggestExtraSwap(
  input: AlternativesInput,
  slot: string,
  componente: Component,
  trocado: ProjectState,
): SwapSuggestion | undefined {
  const base: ExtraSwap = {
    swap: { slot, componente_id: componente.id },
    nome: nameOf(componente),
  };
  const primeiro = bestExtra(
    input,
    [base],
    slotsOfRules(trocado, failing(trocado.validacao, "bloqueante"), new Set([slot])),
  );
  if (!primeiro) return undefined;
  let final = primeiro;
  if (primeiro.avaliacao.incompleto && primeiro.avaliacao.novo) {
    const usados = new Set(primeiro.trocas.map((t) => t.swap.slot));
    const segundo = bestExtra(
      input,
      primeiro.trocas,
      slotsOfRules(primeiro.avaliacao.novo, missing(primeiro.avaliacao.novo.validacao), usados),
    );
    if (segundo && !segundo.avaliacao.incompleto) final = segundo;
  }
  return {
    trocas: final.trocas.slice(1).map((t) => ({
      slot: t.swap.slot,
      rotulo: slotLabel(input.archetype, t.swap.slot),
      componente_id: t.swap.componente_id ?? "",
      nome: t.nome,
    })),
    avaliacao: summary(final.avaliacao),
  };
}

/** Avalia trocar a peça de um slot por `componente` (ou tirar, com null). */
export function evaluateSwap(
  input: AlternativesInput,
  slot: string,
  componente: Component | null,
): SwapCandidate {
  const e = evaluateSwaps(input, [{ slot, componente_id: componente?.id ?? null }]);
  const linha = componente ? e.novo?.custos.pecas.find((l) => l.id === componente.id) : undefined;
  const item = componente
    ? e.novo?.build.itens.find((i) => i.componente.id === componente.id)
    : undefined;
  return {
    ...summary(e),
    componente_id: componente?.id ?? null,
    nome: componente ? nameOf(componente) : "Sem esta peça",
    descricao_leiga: componente?.descricao_leiga ?? "Tira a peça do projeto (o slot é opcional).",
    selo: componente?.status_verificacao ?? "estimativa",
    faixas: componente?.faixas ?? [],
    preco: linha?.faixa,
    vem_com: item?.fornecido_por,
    sugestao:
      !e.compativel && componente && e.novo
        ? suggestExtraSwap(input, slot, componente, e.novo)
        : undefined,
  };
}

export function slotAlternatives(input: AlternativesInput, slot: string): SlotAlternatives {
  const def = input.archetype.slots.find((s) => s.slot === slot);
  if (!def) throw new Error(`slot "${slot}" não existe no arquétipo ${input.archetype.id}`);
  const atualId = input.choice.itens.find((i) => i.slot === slot)?.componente_id;
  const atualComp = input.atual.build.itens.find((i) => i.slot === slot)?.componente;
  const candidatos: SwapCandidate[] = slotCandidates(def, input.catalog)
    .filter((c) => c.id !== atualId)
    .map((c) => evaluateSwap(input, slot, c))
    // Peça que só vem dentro de outro produto e não veio com nada do projeto não é uma opção de
    // compra: nem aparece como "incompatível".
    .filter((c) => {
      const comp = input.catalog.componentes.find((x) => x.id === c.componente_id);
      return c.compativel || comp?.vendido_separadamente !== false;
    });
  if (!def.obrigatorio && atualId) candidatos.push(evaluateSwap(input, slot, null));
  const porCusto = (a: SwapCandidate, b: SwapCandidate) => midpoint(a.delta) - midpoint(b.delta);
  return {
    slot,
    rotulo: slotLabel(input.archetype, slot),
    opcional: !def.obrigatorio,
    atual: atualId && atualComp ? { componente_id: atualId, nome: nameOf(atualComp) } : undefined,
    compativeis: candidatos.filter((c) => c.compativel).sort(porCusto),
    // Primeiro as que resolvem com uma troca a mais.
    incompativeis: candidatos
      .filter((c) => !c.compativel)
      .sort((a, b) => Number(Boolean(b.sugestao)) - Number(Boolean(a.sugestao))),
  };
}

/** Alternativas de todos os slots do arquétipo (para a lista de peças oferecer "trocar"). */
export function allSlotAlternatives(input: AlternativesInput): SlotAlternatives[] {
  return input.archetype.slots.map((s) => slotAlternatives(input, s.slot));
}
