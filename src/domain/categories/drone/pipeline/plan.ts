import { type CentsRange, formatRange } from "../../../core/money";
import type { SafetyAlert } from "../../../core/safety";
import { REGULATORY_DISCLAIMER } from "../../../core/safety";
import { type Tier, TIER_LABEL } from "../build";
import type { DroneConfig } from "../config";
import type { ProjectReport } from "../project";
import { globalAlert, nonRecreationalAlert } from "../safety";
import { SRC } from "../sources";
import type { ArchetypeChoice, ArchetypeId } from "./choose";
import type { DroneIntent } from "./intent";

/*
 * Passos 5 e 6 da SPEC B.10: as 2–3 opções (econômica, equilibrada, premium) do solver,
 * conferidas com o que a pessoa pediu (orçamento, peso, autonomia, carga), e a explicação de
 * inviabilidade com os números do motor de cálculo + a alternativa viável mais próxima.
 * Puro: os planos já calculados (solver + relatório) entram por parâmetro.
 */

export type PlannedTier = { faixa: Tier; report: ProjectReport };
export type ArchetypePlans = {
  id: ArchetypeId;
  nome: string;
  faixas: PlannedTier[];
};

export type BudgetFit = "cabe" | "pode_caber" | "acima";

export type OptionCard = {
  arquetipo_id: ArchetypeId;
  arquetipo_nome: string;
  faixa: Tier;
  rotulo: string;
  total: CentsRange;
  total_pecas: CentsRange;
  sem_preco: number;
  massa_g?: number;
  twr?: number;
  voo: { min?: number; max?: number };
  dificuldade: { rotulo: string; nota: number };
  /** Status das regras: "compativel" (todas passaram), "incompleto" (sem dado) ou "bloqueado". */
  regras: "compativel" | "incompleto" | "bloqueado";
  orcamento?: BudgetFit;
  /** Diferenças entre o que foi pedido e o que esta opção entrega, com números. */
  avisos: string[];
};

export type Infeasibility = {
  motivo: "carga" | "autonomia" | "orcamento" | "peso";
  titulo: string;
  /** Explicação com os números do motor de cálculo. */
  explicacao: string[];
  /** A alternativa viável mais próxima (pode não existir). */
  alternativa?: { titulo: string; opcoes: OptionCard[] };
};

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const n = (v: number) => NUM.format(v);
const reais = (centavos: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(centavos / 100);

function rulesStatus(report: ProjectReport): OptionCard["regras"] {
  const bloqueantes = report.validacao.resultados.filter((r) => r.severidade === "bloqueante");
  if (bloqueantes.some((r) => r.status === "falhou")) return "bloqueado";
  if (bloqueantes.some((r) => r.status === "sem_dado")) return "incompleto";
  return "compativel";
}

/** O total que o orçamento cobre: com ferramentas (padrão) ou só as peças. */
function budgetTotal(card: Pick<OptionCard, "total" | "total_pecas">, i: DroneIntent): CentsRange {
  return i.orcamento_inclui_ferramentas === false ? card.total_pecas : card.total;
}

export function budgetFit(total: CentsRange, orcamentoBrl: number): BudgetFit {
  const teto = Math.round(orcamentoBrl * 100);
  if (total.max_centavos <= teto) return "cabe";
  if (total.min_centavos <= teto) return "pode_caber";
  return "acima";
}

export function optionCard(plans: ArchetypePlans, t: PlannedTier, i: DroneIntent): OptionCard {
  const r = t.report;
  const card: OptionCard = {
    arquetipo_id: plans.id,
    arquetipo_nome: plans.nome,
    faixa: t.faixa,
    rotulo: TIER_LABEL[t.faixa],
    total: r.custos.total,
    total_pecas: r.custos.total_pecas,
    sem_preco: r.custos.sem_preco.length,
    massa_g: r.metricas.auw.massa_total_g,
    twr: r.metricas.propulsion.twr,
    voo: { min: r.metricas.flight.min_minutos, max: r.metricas.flight.max_minutos },
    dificuldade: { rotulo: r.dificuldade.rotulo, nota: r.dificuldade.nota },
    regras: rulesStatus(r),
    avisos: [],
  };
  if (i.orcamento_max_brl !== null) {
    card.orcamento = budgetFit(budgetTotal(card, i), i.orcamento_max_brl);
    const qual =
      i.orcamento_inclui_ferramentas === false ? "As peças custam" : "Com as ferramentas, custa";
    if (card.orcamento === "acima")
      card.avisos.push(
        `${qual} ${formatRange(budgetTotal(card, i))}: acima do seu orçamento de ${reais(i.orcamento_max_brl * 100)}.`,
      );
    else if (card.orcamento === "pode_caber")
      card.avisos.push(
        `${qual} ${formatRange(budgetTotal(card, i))}: cabe no seu orçamento de ${reais(i.orcamento_max_brl * 100)} só se você achar os preços mais baixos.`,
      );
  }
  if (card.sem_preco > 0)
    card.avisos.push(
      `${card.sem_preco} item(ns) ainda sem preço pesquisado ficaram fora do total.`,
    );
  if (i.limite_peso_g !== null && card.massa_g !== undefined && card.massa_g > i.limite_peso_g)
    card.avisos.push(
      `Pesa ${n(card.massa_g)} g: acima do limite de ${n(i.limite_peso_g)} g que você pediu.`,
    );
  if (
    i.autonomia_min_desejada !== null &&
    card.voo.max !== undefined &&
    card.voo.max < i.autonomia_min_desejada
  )
    card.avisos.push(
      `Voa de ${n(card.voo.min ?? card.voo.max)} a ${n(card.voo.max)} min (estimativa): menos que os ${n(i.autonomia_min_desejada)} min que você pediu.`,
    );
  if (i.gps && plans.id !== "a1-gps-filmagem")
    card.avisos.push("Este drone não tem GPS nem retorno automático.");
  return card;
}

const allTiers = (todos: ArchetypePlans[]) =>
  todos.flatMap((p) => p.faixas.map((t) => ({ plans: p, tier: t })));

// ---------------------------------------------------------------------------
// Inviabilidade, com os números do motor de cálculo
// ---------------------------------------------------------------------------

/** Carga: nenhum drone da v1 é de carga; mostra quanto o mais forte do catálogo aguentaria. */
function payloadInfeasibility(
  i: DroneIntent,
  todos: ArchetypePlans[],
  config: DroneConfig,
): Infeasibility {
  const twrMin = config.twr.minimo_seguro;
  const candidatos = allTiers(todos).flatMap(({ plans, tier }) => {
    const { empuxo_total_g } = tier.report.metricas.propulsion;
    const massa = tier.report.metricas.auw.massa_total_g;
    if (empuxo_total_g === undefined || massa === undefined) return [];
    return [{ plans, tier, empuxo: empuxo_total_g, massa, sobra: empuxo_total_g / twrMin - massa }];
  });
  const melhor = candidatos.sort((a, b) => b.sobra - a.sobra)[0];
  const explicacao: string[] = [];
  const pedido = i.carga_kg !== null ? `${n(i.carga_kg)} kg` : "carga";
  if (melhor) {
    explicacao.push(
      `O drone mais forte do catálogo (${melhor.plans.nome}, faixa ${TIER_LABEL[melhor.tier.faixa].toLowerCase()}) tem empuxo máximo de ${n(melhor.empuxo)} g e pesa ${n(melhor.massa)} g.`,
      `Para voar com segurança, o empuxo precisa ser pelo menos ${n(twrMin)} vezes o peso total. Sobram, no máximo, ${n(Math.max(0, melhor.sobra))} g para carregar alguma coisa.`,
    );
    if (i.carga_kg !== null && melhor.sobra > 0)
      explicacao.push(
        `Você pediu ${pedido} (${n(i.carga_kg * 1000)} g): cerca de ${n(Math.round((i.carga_kg * 1000) / melhor.sobra))} vezes o que ele aguenta.`,
      );
  }
  explicacao.push(
    "Drones de carga são outra classe de projeto (motores, hélices e baterias muito maiores, com regras próprias), fora do que o catálogo e esta versão do app cobrem.",
  );
  const maisBarato = cheapest(todos, i);
  if (i.orcamento_max_brl !== null && maisBarato)
    explicacao.push(
      `Além disso, o projeto mais barato do catálogo custa ${formatRange(budgetTotal(maisBarato, i))}, e o seu orçamento é de ${reais(i.orcamento_max_brl * 100)}.`,
    );
  return {
    motivo: "carga",
    titulo: `Não dá para montar um drone que carregue ${pedido}`,
    explicacao,
    alternativa: melhor
      ? {
          titulo:
            "O mais perto disso no catálogo: o drone mais forte, que carrega uma câmera pequena",
          opcoes: [optionCard(melhor.plans, melhor.tier, i)],
        }
      : undefined,
  };
}

/** Autonomia acima do que qualquer build do catálogo voa. */
function enduranceInfeasibility(
  i: DroneIntent,
  todos: ArchetypePlans[],
): Infeasibility | undefined {
  const pedido = i.autonomia_min_desejada;
  if (pedido === null) return undefined;
  const comVoo = allTiers(todos).filter(
    ({ tier }) => tier.report.metricas.flight.max_minutos !== undefined,
  );
  const melhor = comVoo.sort(
    (a, b) =>
      (b.tier.report.metricas.flight.max_minutos ?? 0) -
      (a.tier.report.metricas.flight.max_minutos ?? 0),
  )[0];
  const max = melhor?.tier.report.metricas.flight.max_minutos;
  if (!melhor || max === undefined || max >= pedido) return undefined;
  const min = melhor.tier.report.metricas.flight.min_minutos ?? max;
  const explicacao = [
    `O que voa mais tempo no catálogo é o ${melhor.plans.nome} (faixa ${TIER_LABEL[melhor.tier.faixa].toLowerCase()}): de ${n(min)} a ${n(max)} minutos por bateria (estimativa do motor de cálculo). Você pediu ${n(pedido)} minutos.`,
    "Em drones elétricos, mais bateria significa mais peso, e mais peso pede mais empuxo, que gasta mais bateria: a partir de certo ponto, o tempo de voo para de crescer.",
    "Dá para voar mais tempo no total levando baterias reservas e trocando entre os voos.",
  ];
  const maisBarato = cheapest(todos, i);
  if (i.orcamento_max_brl !== null && maisBarato)
    explicacao.push(
      `Sobre o orçamento: o projeto mais barato do catálogo custa ${formatRange(budgetTotal(maisBarato, i))}, e o seu é de ${reais(i.orcamento_max_brl * 100)}.`,
    );
  return {
    motivo: "autonomia",
    titulo: `Nenhum drone do catálogo voa ${n(pedido)} minutos`,
    explicacao,
    alternativa: {
      titulo: "O que voa mais tempo no catálogo",
      opcoes: [optionCard(melhor.plans, melhor.tier, i)],
    },
  };
}

/** Orçamento abaixo do projeto mais barato do catálogo inteiro (qualquer arquétipo). */
function catalogBudgetInfeasibility(
  i: DroneIntent,
  todos: ArchetypePlans[],
): Infeasibility | undefined {
  if (i.orcamento_max_brl === null) return undefined;
  const maisBarato = cheapest(todos, i);
  if (!maisBarato || maisBarato.orcamento !== "acima") return undefined;
  return {
    motivo: "orcamento",
    titulo: "Nenhum projeto do catálogo cabe neste orçamento",
    explicacao: [
      `O projeto mais barato do catálogo (${maisBarato.arquetipo_nome}, faixa ${maisBarato.rotulo.toLowerCase()}) custa ${formatRange(budgetTotal(maisBarato, i))}${i.orcamento_inclui_ferramentas === false ? " (só as peças)" : ", contando as ferramentas"}. Seu orçamento: ${reais(i.orcamento_max_brl * 100)}.`,
      'Dá para reduzir o custo se você já tiver ferramentas (marque "já tenho" na lista do projeto).',
    ],
    alternativa: { titulo: "O projeto mais barato do catálogo", opcoes: [maisBarato] },
  };
}

/**
 * Inviável para qualquer arquétipo (autonomia acima do que o catálogo voa, orçamento abaixo do
 * mais barato): vale avisar antes de fazer perguntas, que não mudariam a resposta.
 */
export function catalogInfeasibility(
  i: DroneIntent,
  todos: ArchetypePlans[],
): Infeasibility | undefined {
  return enduranceInfeasibility(i, todos) ?? catalogBudgetInfeasibility(i, todos);
}

/** A opção mais barata (pelo mínimo do total que o orçamento cobre). */
function cheapest(todos: ArchetypePlans[], i: DroneIntent): OptionCard | undefined {
  return allTiers(todos)
    .map(({ plans, tier }) => optionCard(plans, tier, i))
    .sort((a, b) => budgetTotal(a, i).min_centavos - budgetTotal(b, i).min_centavos)[0];
}

function budgetInfeasibility(
  i: DroneIntent,
  escolhido: ArchetypePlans,
  cards: OptionCard[],
  todos: ArchetypePlans[],
): Infeasibility | undefined {
  if (i.orcamento_max_brl === null || cards.length === 0) return undefined;
  if (cards.some((c) => c.orcamento !== "acima")) return undefined;
  const orcamento = i.orcamento_max_brl;
  const maisBaratoDele = [...cards].sort(
    (a, b) => budgetTotal(a, i).min_centavos - budgetTotal(b, i).min_centavos,
  )[0];
  const explicacao: string[] = [];
  if (maisBaratoDele)
    explicacao.push(
      `A opção mais barata do ${escolhido.nome} que passa nas regras custa ${formatRange(budgetTotal(maisBaratoDele, i))}${i.orcamento_inclui_ferramentas === false ? " (só as peças)" : ", contando as ferramentas"}. Seu orçamento: ${reais(orcamento * 100)}.`,
    );
  // Alternativa: o que cabe no orçamento em outro arquétipo, ou o mais barato de todos.
  const outros = allTiers(todos)
    .filter(({ plans }) => plans.id !== escolhido.id)
    .map(({ plans, tier }) => optionCard(plans, tier, i))
    .filter((c) => c.orcamento !== "acima" && c.regras !== "bloqueado")
    .sort((a, b) => budgetTotal(a, i).min_centavos - budgetTotal(b, i).min_centavos);
  if (outros[0]) {
    explicacao.push(
      `O que cabe no orçamento é outro tipo de drone: o ${outros[0].arquetipo_nome}. Ele não faz tudo o que você pediu; compare antes de decidir.`,
    );
    return {
      motivo: "orcamento",
      titulo: "O drone que você pediu não cabe no orçamento",
      explicacao,
      alternativa: { titulo: "O mais perto que cabe no orçamento", opcoes: [outros[0]] },
    };
  }
  const maisBarato = cheapest(todos, i);
  if (maisBarato)
    explicacao.push(
      `O projeto mais barato de todo o catálogo custa ${formatRange(budgetTotal(maisBarato, i))}.`,
    );
  explicacao.push(
    'Dá para reduzir o custo se você já tiver ferramentas (marque "já tenho" na lista do projeto).',
  );
  return {
    motivo: "orcamento",
    titulo: "Nenhum projeto do catálogo cabe neste orçamento",
    explicacao,
    alternativa: maisBaratoDele
      ? { titulo: "A opção mais barata do drone que você pediu", opcoes: [maisBaratoDele] }
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Alertas do pedido (além dos alertas de cada projeto)
// ---------------------------------------------------------------------------

export function requestAlerts(i: DroneIntent): SafetyAlert[] {
  const alertas: SafetyAlert[] = [];
  if (i.alcance_m_desejado !== null && i.alcance_m_desejado > 300) {
    const km = i.alcance_m_desejado >= 1000;
    alertas.push({
      id: "alcance-pedido",
      nivel: "regulatorio",
      titulo: `Você pediu voar a ${km ? `${n(i.alcance_m_desejado / 1000)} km` : `${n(i.alcance_m_desejado)} m`} de distância`,
      texto: `No voo recreativo, a regra é ficar até 300 m de distância e até 60 m de altura, sempre vendo o drone com os próprios olhos (veja "Regras de voo no Brasil"). Os projetos do app são feitos para voar dentro desse limite. Longe e fora da vista, você não vê obstáculos nem outras aeronaves, e o sinal do rádio e do vídeo cai com árvores, prédios e morros. ${REGULATORY_DISCLAIMER}`,
      acoes: [
        "Voe sempre vendo o drone com os próprios olhos.",
        "Configure o retorno automático (quando o drone tiver GPS) e teste antes, perto e baixo.",
      ],
      fontes: [SRC.anacRes806, SRC.deceaIca10040],
      verificado_em: globalAlert("regulamentacao")?.verificado_em,
    });
  }
  if (i.perto_de_pessoas) {
    alertas.push({
      id: "pessoas-no-pedido",
      nivel: "perigo",
      titulo: "Você vai voar perto de pessoas",
      texto: `Em festas e eventos há muita gente no caminho: uma queda ou uma hélice girando pode machucar. Mantenha distância das pessoas, não passe por cima delas e combine antes com quem organiza. As regras de distância de pessoas estão em "Regras de voo no Brasil". ${REGULATORY_DISCLAIMER}`,
      acoes: [
        "Defina com o organizador uma área de decolagem e pouso sem gente por perto.",
        "Treine bastante antes, longe de pessoas, até ter controle total do drone.",
      ],
      fontes: [SRC.deceaIca10040, SRC.ardupilotSafety],
      verificado_em: globalAlert("regulamentacao")?.verificado_em,
    });
  }
  if (i.uso_comercial) alertas.push(nonRecreationalAlert());
  const regras = globalAlert("regulamentacao");
  if (regras && alertas.length > 0) alertas.push(regras);
  return alertas;
}

/** Junta alertas sem repetir (o primeiro de cada id vence). */
export function mergeAlerts(...listas: SafetyAlert[][]): SafetyAlert[] {
  const vistos = new Set<string>();
  return listas.flat().filter((a) => (vistos.has(a.id) ? false : (vistos.add(a.id), true)));
}

/**
 * Alertas que valem a pena mostrar antes de escolher: perigo e regras (o resto vai no projeto),
 * o simulador e o aviso do iPhone (muda o que a pessoa vai conseguir usar).
 */
const SEMPRE_NO_TOPO = new Set(["simulador", "iphone"]);
export function headlineAlerts(report: ProjectReport): SafetyAlert[] {
  return report.alertas.filter(
    (a) => a.nivel === "perigo" || a.nivel === "regulatorio" || SEMPRE_NO_TOPO.has(a.id),
  );
}

// ---------------------------------------------------------------------------
// Resultado do planejamento
// ---------------------------------------------------------------------------

export type PlanResult =
  | {
      tipo: "opcoes";
      arquetipo: { id: ArchetypeId; nome: string };
      opcoes: OptionCard[];
      alertas: SafetyAlert[];
    }
  | { tipo: "inviavel"; inviabilidade: Infeasibility; alertas: SafetyAlert[] };

/**
 * Do arquétipo escolhido e dos planos de todos os arquétipos (para comparar carga, autonomia e
 * preço) às opções ou à explicação de inviabilidade.
 */
export function planRequest(
  i: DroneIntent,
  escolha: Extract<ArchetypeChoice, { tipo: "arquetipo" | "carga" }>,
  todos: ArchetypePlans[],
  config: DroneConfig,
): PlanResult {
  const pedido = requestAlerts(i);
  if (escolha.tipo === "carga") {
    return {
      tipo: "inviavel",
      inviabilidade: payloadInfeasibility(i, todos, config),
      alertas: pedido,
    };
  }
  const autonomia = enduranceInfeasibility(i, todos);
  if (autonomia) return { tipo: "inviavel", inviabilidade: autonomia, alertas: pedido };

  const escolhido = todos.find((p) => p.id === escolha.id);
  if (!escolhido || escolhido.faixas.length === 0) {
    return {
      tipo: "inviavel",
      inviabilidade: {
        motivo: "orcamento",
        titulo: "O catálogo não tem peças para montar este drone agora",
        explicacao: ["Nenhuma combinação de peças passou em todas as regras. Confira o catálogo."],
      },
      alertas: pedido,
    };
  }
  const opcoes = escolhido.faixas.map((t) => optionCard(escolhido, t, i));
  const orcamento = budgetInfeasibility(i, escolhido, opcoes, todos);
  const doProjeto = escolhido.faixas[0] ? headlineAlerts(escolhido.faixas[0].report) : [];
  if (orcamento)
    return { tipo: "inviavel", inviabilidade: orcamento, alertas: mergeAlerts(pedido, doProjeto) };
  return {
    tipo: "opcoes",
    arquetipo: { id: escolhido.id, nome: escolhido.nome },
    opcoes,
    alertas: mergeAlerts(pedido, doProjeto),
  };
}
