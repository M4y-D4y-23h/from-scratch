import { createHash } from "node:crypto";

import { z } from "zod";

import type { Tier } from "@/domain/categories/drone/build";
import { type DroneConfig, DEFAULT_DRONE_CONFIG } from "@/domain/categories/drone/config";
import {
  type Answers,
  ARCHETYPE_IDS,
  type ArchetypeChoice,
  applyAnswers,
  assumptions,
  buildOptionsFor,
  chooseArchetype,
  pendingQuestions,
  type Question,
  type QuestionId,
  QUESTIONS,
} from "@/domain/categories/drone/pipeline/choose";
import { acceptExplanation, type Explanation } from "@/domain/categories/drone/pipeline/explain";
import { heuristicIntent } from "@/domain/categories/drone/pipeline/heuristic";
import {
  type DroneIntent,
  EMPTY_INTENT,
  sanitizeIntent,
} from "@/domain/categories/drone/pipeline/intent";
import {
  type ArchetypePlans,
  catalogInfeasibility,
  type Infeasibility,
  type OptionCard,
  optionCard,
  planRequest,
  requestAlerts,
} from "@/domain/categories/drone/pipeline/plan";
import {
  BLOCKED_CATEGORIES,
  type BlockedCategory,
  GENERIC_REFUSAL,
  prefilterRequest,
  REFUSALS,
} from "@/domain/categories/drone/pipeline/safety-filter";
import { buildProjectReport } from "@/domain/categories/drone/project";
import { formatBRL } from "@/domain/core/money";
import type { SafetyAlert } from "@/domain/core/safety";
import { memo } from "@/server/cache/memo";
import type { LoadedCatalog } from "@/server/catalog/load";
import { configKey, ownedKey, solveCached } from "@/server/engine/solve";
import {
  type CallRecord,
  describeLlmError,
  LlmRefusal,
  llmMode,
  type LlmMode,
  type StructuredCall,
  structuredCall,
} from "@/server/llm/client";
import { PROMPT_VERSION } from "@/server/llm/config";
import {
  ANALYSIS_SYSTEM,
  analysisUserMessage,
  EXPLANATION_SYSTEM,
  explanationUserMessage,
} from "@/server/llm/prompts";
import { explanationSchema, requestAnalysisSchema } from "@/server/llm/schemas";

/*
 * Pipeline pedido → opções (SPEC B.10, passos 1 a 6). A ordem segue a hierarquia da verdade:
 * 1. segurança (pré-filtro determinístico; depois a classificação pelo LLM);
 * 2. intenção (LLM com saída estruturada, ou o modo simples por palavras-chave);
 * 3. perguntas clicáveis (regras), 4. arquétipo (regras), 5–6. solver + validador + custos.
 * O LLM nunca produz número: só lê o pedido e, depois, explica a escolha sem algarismos.
 */

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export const MAX_PEDIDO = 1000;

export const pedidoSchema = z
  .string()
  .trim()
  .min(3, "Escreva um pouco mais sobre o drone que você quer.")
  .max(MAX_PEDIDO, `Use até ${MAX_PEDIDO} letras.`);

/** Só ficam as respostas que existem nas opções clicáveis (o navegador pode mandar qualquer coisa). */
export function cleanAnswers(bruto: unknown): Answers {
  const parsed = z.record(z.string(), z.unknown()).safeParse(bruto);
  if (!parsed.success) return {};
  const respostas: Answers = {};
  for (const [id, valor] of Object.entries(parsed.data)) {
    const pergunta = QUESTIONS[id as QuestionId] as Question | undefined;
    if (pergunta && typeof valor === "string" && pergunta.opcoes.some((o) => o.valor === valor)) {
      respostas[pergunta.id] = valor;
    }
  }
  return respostas;
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export type SafetyLabel = "permitido" | "permitido_com_alertas" | "bloqueado";

/** O que vai para o registro de segurança (SPEC B.9: "registre todo bloqueio ou alerta"). */
export type SafetyRecord = {
  origem: "prefiltro" | "ia" | "simples";
  classificacao: SafetyLabel;
  categorias: string[];
  motivo: string;
};

export type RefusalView = {
  categoria?: BlockedCategory;
  titulo: string;
  explicacao: string;
  alternativa?: string;
};

export type ArchetypeSummary = { id: string; nome: string; descricao: string; para_quem: string };

type Common = {
  pedido: string;
  modo: LlmMode;
  /** Avisos sobre como o pedido foi lido (IA fora do ar, pedido fora do escopo...). */
  avisos: string[];
  seguranca: SafetyRecord;
};

type Answered = Common & {
  intencao: DroneIntent;
  respostas: Answers;
  alertas: SafetyAlert[];
  suposicoes: string[];
};

export type PipelineResult =
  | (Common & { tipo: "recusa"; recusa: RefusalView })
  | (Answered & { tipo: "perguntas"; perguntas: Question[] })
  | (Answered & {
      tipo: "opcoes";
      arquetipo: ArchetypeSummary;
      motivos: string[];
      opcoes: OptionCard[];
    })
  | (Answered & { tipo: "inviavel"; inviabilidade: Infeasibility });

export type OptionsResult = Extract<PipelineResult, { tipo: "opcoes" }>;

// ---------------------------------------------------------------------------
// Análise do pedido (segurança + intenção)
// ---------------------------------------------------------------------------

export type Analysis = {
  intencao: DroneIntent;
  seguranca: SafetyRecord & { precisa_esclarecer: boolean };
  modo: LlmMode;
  avisos: string[];
  uso?: CallRecord;
};

export type Analyzer = (pedido: string) => Promise<Analysis>;

type UsageSink = StructuredCall<z.ZodType>["registro"];
type UsageHook = StructuredCall<z.ZodType>["aoUsar"];

/** Riscos que a própria intenção já mostra (valem nos dois modos, com ou sem IA). */
function alertCategories(i: DroneIntent): string[] {
  const c: string[] = [];
  if (i.alcance_m_desejado !== null && i.alcance_m_desejado > 300) c.push("alcance_alem_da_visada");
  if (i.perto_de_pessoas) c.push("voo_perto_de_pessoas");
  if (i.uso_comercial) c.push("uso_comercial");
  return c;
}

/** Modo simples: palavras-chave, sem custo. O pré-filtro já cuidou dos bloqueios óbvios. */
export function simpleAnalysis(pedido: string, avisos: string[] = []): Analysis {
  const intencao = heuristicIntent(pedido);
  const categorias = alertCategories(intencao);
  return {
    intencao,
    seguranca: {
      origem: "simples",
      classificacao: categorias.length > 0 ? "permitido_com_alertas" : "permitido",
      categorias,
      motivo:
        categorias.length > 0
          ? "Pedido com riscos que pedem alertas (lido no modo simples)."
          : "Nenhum risco especial encontrado (lido no modo simples).",
      precisa_esclarecer: false,
    },
    modo: "simples",
    avisos,
  };
}

export const simpleAnalyzer: Analyzer = async (pedido) => simpleAnalysis(pedido);

/** Análise pelo Claude (uma chamada: segurança + intenção). Falha da API → modo simples. */
export function llmAnalyzer(registro?: UsageSink, aoUsar?: UsageHook): Analyzer {
  return async (pedido) => {
    try {
      const { dados, uso } = await structuredCall({
        rota: "analise_pedido",
        system: ANALYSIS_SYSTEM,
        user: analysisUserMessage(pedido),
        schema: requestAnalysisSchema,
        registro,
        aoUsar,
      });
      const intencao = sanitizeIntent(dados.intencao);
      const extras = alertCategories(intencao);
      const categorias = [
        ...new Set([...dados.seguranca.categorias.filter((c) => c !== "nenhuma"), ...extras]),
      ];
      let classificacao = dados.seguranca.classificacao;
      // Segurança primeiro: uma categoria proibida bloqueia mesmo se a classificação disser outra coisa.
      if (categorias.some((c) => (BLOCKED_CATEGORIES as readonly string[]).includes(c)))
        classificacao = "bloqueado";
      else if (classificacao === "permitido" && extras.length > 0)
        classificacao = "permitido_com_alertas";
      return {
        intencao,
        seguranca: {
          origem: "ia",
          classificacao,
          categorias,
          motivo: dados.seguranca.motivo,
          precisa_esclarecer: dados.seguranca.precisa_esclarecer,
        },
        modo: "ia",
        avisos: [],
        uso,
      };
    } catch (error) {
      if (error instanceof LlmRefusal) {
        return {
          intencao: EMPTY_INTENT,
          seguranca: {
            origem: "ia",
            classificacao: "bloqueado",
            categorias: [],
            motivo: `O modelo se recusou a analisar o pedido (categoria: ${error.categoria ?? "não informada"}).`,
            precisa_esclarecer: false,
          },
          modo: "ia",
          avisos: [],
        };
      }
      console.error("Falha na análise pela IA; o pedido foi lido no modo simples:", error);
      return simpleAnalysis(pedido, [
        `${describeLlmError(error)} O pedido foi lido no modo simples (por palavras-chave), que entende menos. Tente de novo mais tarde para uma leitura melhor.`,
      ]);
    }
  };
}

type Pending<T> = { promessa: Promise<T>; reserva: boolean };
const g = globalThis as typeof globalThis & {
  __fromScratchAnalises?: Map<string, Pending<Analysis>>;
  __fromScratchExplicacoes?: Map<string, Pending<Explanation>>;
};
const LIMITE_MEMORIA = 64;

/**
 * Memória das respostas da IA (por versão do prompt + texto): clicar numa pergunta ou criar o
 * projeto refaz o pipeline sem pagar outra chamada. Resposta de reserva (a IA falhou e entrou o
 * modo simples ou as regras) é refeita quando `tentarDeNovo` (pedido novo, não um clique).
 */
function remember<T>(
  mapa: Map<string, Pending<T>>,
  chave: string,
  calcular: () => Promise<T>,
  ehReserva: (v: T) => boolean,
  tentarDeNovo: boolean,
): Promise<T> {
  const atual = mapa.get(chave);
  if (atual && !(tentarDeNovo && atual.reserva)) {
    mapa.delete(chave);
    mapa.set(chave, atual);
    return atual.promessa;
  }
  const entrada: Pending<T> = { promessa: calcular(), reserva: false };
  entrada.promessa.then(
    (v) => {
      entrada.reserva = ehReserva(v);
    },
    () => mapa.delete(chave),
  );
  mapa.set(chave, entrada);
  if (mapa.size > LIMITE_MEMORIA) {
    const maisAntiga = mapa.keys().next();
    if (!maisAntiga.done) mapa.delete(maisAntiga.value);
  }
  return entrada.promessa;
}

const textKey = (texto: string) => createHash("sha256").update(texto).digest("hex").slice(0, 24);

/** O analisador do app: IA quando há chave (com memória), senão o modo simples. */
export function appAnalyzer(
  opcoes: { registro?: UsageSink; tentarDeNovo?: boolean } = {},
): Analyzer {
  if (llmMode() === "simples") return simpleAnalyzer;
  const base = llmAnalyzer(opcoes.registro);
  g.__fromScratchAnalises ??= new Map();
  const mapa = g.__fromScratchAnalises;
  return (pedido) =>
    remember(
      mapa,
      `${PROMPT_VERSION}|${textKey(pedido)}`,
      () => base(pedido),
      (a) => a.modo === "simples",
      opcoes.tentarDeNovo ?? false,
    );
}

// ---------------------------------------------------------------------------
// Planos (solver + relatório) de todos os arquétipos
// ---------------------------------------------------------------------------

export type PipelineDeps = {
  loaded: LoadedCatalog;
  analisar: Analyzer;
  config?: DroneConfig;
  ferramentasQueTenho?: ReadonlySet<string>;
};

/**
 * As 3 faixas de cada arquétipo, com as opções que o pedido pede. Todos entram porque a
 * inviabilidade compara com o catálogo inteiro (o mais forte, o que voa mais, o mais barato).
 */
export function archetypePlans(
  loaded: LoadedCatalog,
  intencao: DroneIntent,
  respostas: Answers,
  config: DroneConfig = DEFAULT_DRONE_CONFIG,
  owned: ReadonlySet<string> = new Set(),
): ArchetypePlans[] {
  return Object.values(ARCHETYPE_IDS).flatMap((id) => {
    const archetype = loaded.catalog.arquetipos.find((a) => a.id === id);
    if (!archetype) return [];
    const opcoes = buildOptionsFor(intencao, id, respostas);
    const resultado = solveCached(loaded, archetype, {
      config,
      opcoes,
      ferramentasQueTenho: owned,
    });
    const faixas = resultado.faixas.map((plano) => ({
      faixa: plano.faixa,
      report: memo(
        [
          "relatorio",
          loaded.hash,
          id,
          plano.faixa,
          configKey(config),
          JSON.stringify(opcoes),
          ownedKey(owned),
        ].join("|"),
        () => buildProjectReport(plano.build, archetype, loaded.catalog, config, owned),
      ),
    }));
    return [{ id, nome: archetype.nome, faixas }];
  });
}

// ---------------------------------------------------------------------------
// O pipeline
// ---------------------------------------------------------------------------

/** Na pergunta do orçamento, quanto custa hoje o projeto mais barato do catálogo (motor de cálculo). */
function withCheapest(perguntas: Question[], todos: ArchetypePlans[], i: DroneIntent): Question[] {
  const minimo = Math.min(
    ...todos.flatMap((p) => p.faixas.map((t) => optionCard(p, t, i).total.min_centavos)),
  );
  if (!Number.isFinite(minimo)) return perguntas;
  return perguntas.map((p) =>
    p.id === "orcamento"
      ? {
          ...p,
          ajuda:
            `${p.ajuda ?? ""} Hoje, o projeto mais barato do catálogo custa a partir de ${formatBRL(minimo)}, com as ferramentas.`.trim(),
        }
      : p,
  );
}

function refusalFor(categorias: readonly string[]): RefusalView {
  const categoria = BLOCKED_CATEGORIES.find((c) => categorias.includes(c));
  return categoria ? { categoria, ...REFUSALS[categoria] } : { ...GENERIC_REFUSAL };
}

const FORA_DO_ESCOPO =
  "O From Scratch monta drones multirrotores (com hélices girando na horizontal, como os quadricópteros). Mostramos o mais perto do que você pediu.";

const PADRAO_SEM_OBJETIVO =
  "Sem um objetivo definido, começamos pelo jeito mais seguro e barato de aprender: o Tiny Whoop, pequeno e com as hélices protegidas.";

export async function runPipeline(
  input: { pedido: string; respostas?: unknown },
  deps: PipelineDeps,
): Promise<PipelineResult> {
  const pedido = pedidoSchema.parse(input.pedido);
  const respostas = cleanAnswers(input.respostas ?? {});

  // 1a. Pré-filtro: os casos óbvios nem chegam à IA.
  const filtro = prefilterRequest(pedido);
  if (filtro.bloqueado) {
    return {
      tipo: "recusa",
      pedido,
      modo: llmMode(),
      avisos: [],
      seguranca: {
        origem: "prefiltro",
        classificacao: "bloqueado",
        categorias: [filtro.recusa.categoria],
        motivo: "Bloqueado pelo pré-filtro de palavras e padrões.",
      },
      recusa: filtro.recusa,
    };
  }

  // 1b + 2. Segurança pelo LLM e intenção.
  const analise = await deps.analisar(pedido);
  const { precisa_esclarecer, ...seguranca } = analise.seguranca;
  const common: Common = { pedido, modo: analise.modo, avisos: [...analise.avisos], seguranca };
  if (seguranca.classificacao === "bloqueado") {
    return { ...common, tipo: "recusa", recusa: refusalFor(seguranca.categorias) };
  }
  if (seguranca.categorias.includes("fora_do_escopo")) common.avisos.push(FORA_DO_ESCOPO);

  // 3. Respostas clicadas entram na intenção; o que faltar vira pergunta.
  const intencao = applyAnswers(analise.intencao, respostas);
  let escolha: ArchetypeChoice = chooseArchetype(intencao);
  const perguntas = pendingQuestions(intencao, escolha, respostas);
  // Objetivo ambíguo do ponto de vista de segurança: pergunta antes de mostrar qualquer projeto.
  if (
    precisa_esclarecer &&
    respostas.objetivo === undefined &&
    !perguntas.some((p) => p.id === "objetivo")
  )
    perguntas.unshift(QUESTIONS.objetivo);
  const base = { ...common, intencao, respostas, alertas: requestAlerts(intencao) };
  const config = deps.config ?? DEFAULT_DRONE_CONFIG;
  const todos = archetypePlans(deps.loaded, intencao, respostas, config, deps.ferramentasQueTenho);
  if (perguntas.length > 0) {
    const id = escolha.tipo === "arquetipo" ? escolha.id : undefined;
    const suposicoes = assumptions(intencao, id, respostas);
    // Inviável com qualquer drone do catálogo: as perguntas não mudariam a resposta.
    const esclarecerAntes = precisa_esclarecer && respostas.objetivo === undefined;
    const inviavel = esclarecerAntes ? undefined : catalogInfeasibility(intencao, todos);
    if (inviavel) return { ...base, tipo: "inviavel", inviabilidade: inviavel, suposicoes };
    return {
      ...base,
      tipo: "perguntas",
      perguntas: withCheapest(perguntas, todos, intencao),
      suposicoes,
    };
  }

  // 4. Arquétipo (regras). Ainda indefinido depois das perguntas: o mais seguro para começar.
  if (escolha.tipo === "indefinido") {
    escolha = { tipo: "arquetipo", id: ARCHETYPE_IDS.whoop, motivos: [PADRAO_SEM_OBJETIVO] };
  }

  // 5–6. Solver, validador e custos; opções ou inviabilidade com números.
  const plano = planRequest(intencao, escolha, todos, config);
  const suposicoes = assumptions(
    intencao,
    escolha.tipo === "arquetipo" ? escolha.id : undefined,
    respostas,
  );
  if (plano.tipo === "inviavel") {
    return {
      ...base,
      tipo: "inviavel",
      inviabilidade: plano.inviabilidade,
      alertas: plano.alertas,
      suposicoes,
    };
  }
  const archetype = deps.loaded.catalog.arquetipos.find((a) => a.id === plano.arquetipo.id);
  return {
    ...base,
    tipo: "opcoes",
    arquetipo: {
      id: plano.arquetipo.id,
      nome: plano.arquetipo.nome,
      descricao: archetype?.descricao ?? "",
      para_quem: archetype?.para_quem ?? "",
    },
    motivos: escolha.tipo === "arquetipo" ? escolha.motivos : [],
    opcoes: plano.opcoes,
    alertas: plano.alertas,
    suposicoes,
  };
}

/** Cartões que a pessoa pode escolher para virar projeto (as opções ou a alternativa viável). */
export function selectableCards(r: PipelineResult): OptionCard[] {
  if (r.tipo === "opcoes") return r.opcoes;
  if (r.tipo === "inviavel") return r.inviabilidade.alternativa?.opcoes ?? [];
  return [];
}

export function findCard(
  r: PipelineResult,
  arquetipoId: string,
  faixa: Tier,
): OptionCard | undefined {
  return selectableCards(r).find((c) => c.arquetipo_id === arquetipoId && c.faixa === faixa);
}

// ---------------------------------------------------------------------------
// Explicação da escolha (passo 4: "o LLM apenas explica")
// ---------------------------------------------------------------------------

/** Explica a escolha em linguagem simples. Sem IA, ou se o texto tiver número: os motivos das regras. */
export async function explainChoice(
  r: OptionsResult,
  opcoes: { registro?: UsageSink; aoUsar?: UsageHook; tentarDeNovo?: boolean } = {},
): Promise<Explanation> {
  const regras: Explanation = { paragrafos: r.motivos, origem: "regras" };
  if (r.modo === "simples" || llmMode() === "simples") return regras;
  const dados = {
    pedido: r.pedido,
    arquetipo: r.arquetipo.nome,
    descricao: r.arquetipo.descricao,
    motivos: r.motivos,
    suposicoes: r.suposicoes,
  };
  g.__fromScratchExplicacoes ??= new Map();
  return remember(
    g.__fromScratchExplicacoes,
    `${PROMPT_VERSION}|${textKey(JSON.stringify(dados))}`,
    async () => {
      try {
        const { dados: saida } = await structuredCall({
          rota: "explicacao_projeto",
          system: EXPLANATION_SYSTEM,
          user: explanationUserMessage(dados),
          schema: explanationSchema,
          registro: opcoes.registro,
          aoUsar: opcoes.aoUsar,
        });
        return acceptExplanation(saida.paragrafos, r.motivos);
      } catch (error) {
        console.error("Falha na explicação pela IA; usando os motivos das regras:", error);
        return regras;
      }
    },
    (e) => e.origem === "regras",
    opcoes.tentarDeNovo ?? false,
  );
}
