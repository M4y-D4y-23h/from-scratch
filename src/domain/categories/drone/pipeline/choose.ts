import type { BuildOptions } from "../build";
import type { DroneIntent } from "./intent";

/*
 * Passos 3 e 4 da SPEC B.10, determinísticos: quais perguntas fazer (no máximo 5, com opções
 * clicáveis), como as respostas entram na intenção, qual arquétipo atende o pedido e quais
 * padrões foram assumidos. O LLM só explica a escolha; quem decide são estas regras.
 */

export const ARCHETYPE_IDS = {
  gps: "a1-gps-filmagem",
  fpv: "a2-fpv-5pol",
  whoop: "a3-tiny-whoop",
} as const;
export type ArchetypeId = (typeof ARCHETYPE_IDS)[keyof typeof ARCHETYPE_IDS];

// ---------------------------------------------------------------------------
// Perguntas de esclarecimento
// ---------------------------------------------------------------------------

export type QuestionId = "objetivo" | "onde" | "orcamento" | "celular" | "controle";

export type QuestionOption = { valor: string; rotulo: string; descricao?: string };
export type Question = {
  id: QuestionId;
  pergunta: string;
  ajuda?: string;
  opcoes: QuestionOption[];
};

export const MAX_QUESTIONS = 5;

export const QUESTIONS: Record<QuestionId, Question> = {
  objetivo: {
    id: "objetivo",
    pergunta: "O que você mais quer fazer com o drone?",
    opcoes: [
      { valor: "filmar", rotulo: "Filmar e fotografar", descricao: "Voo estável, imagem firme" },
      {
        valor: "aprender",
        rotulo: "Aprender a pilotar",
        descricao: "Começar do jeito mais simples",
      },
      { valor: "freestyle", rotulo: "Manobras e acrobacias", descricao: "Voo FPV, com óculos" },
      { valor: "corrida", rotulo: "Corrida", descricao: "Bem rápido, com óculos" },
    ],
  },
  onde: {
    id: "onde",
    pergunta: "Onde você vai voar na maior parte do tempo?",
    opcoes: [
      { valor: "dentro_de_casa", rotulo: "Dentro de casa" },
      { valor: "ao_ar_livre", rotulo: "Ao ar livre", descricao: "Campo, parque, viagens" },
      { valor: "os_dois", rotulo: "Nos dois" },
    ],
  },
  orcamento: {
    id: "orcamento",
    pergunta: "Quanto você quer gastar, contando peças e ferramentas?",
    ajuda: "Quem começa do zero também compra ferramentas (ferro de solda, carregador...).",
    // Faixas pensadas para os três tipos de drone do catálogo (o pipeline acrescenta à ajuda
    // quanto custa o projeto mais barato hoje, calculado pelo motor).
    opcoes: [
      { valor: "3000", rotulo: "Até R$ 3.000" },
      { valor: "6000", rotulo: "Até R$ 6.000" },
      { valor: "10000", rotulo: "Até R$ 10.000" },
      { valor: "sem_limite", rotulo: "Ainda não sei", descricao: "Mostre as três faixas de preço" },
    ],
  },
  celular: {
    id: "celular",
    pergunta: "Seu celular é Android ou iPhone?",
    ajuda:
      "O vídeo ao vivo chega no celular por um receptor USB, que costuma funcionar só no Android.",
    opcoes: [
      { valor: "android", rotulo: "Android" },
      { valor: "ios", rotulo: "iPhone" },
      { valor: "desconhecido", rotulo: "Não sei" },
    ],
  },
  controle: {
    id: "controle",
    pergunta: "Como você quer pilotar?",
    ajuda:
      "Recomendamos o rádio: o sinal é dedicado, alcança longe e o drone volta sozinho se ele cair. Só pelo celular o alcance é curto, há atraso e, se o celular falhar, você perde o controle.",
    opcoes: [
      {
        valor: "radio",
        rotulo: "Rádio de controle, com o celular como tela (recomendado)",
        descricao: "Mapa, bateria e o botão de voltar para casa no celular",
      },
      {
        valor: "celular_experimental",
        rotulo: "Só pelo celular (experimental)",
        descricao: "Alcance curto, atraso e risco de perder o controle",
      },
    ],
  },
};

export type Answers = Partial<Record<QuestionId, string>>;

/** As respostas clicadas entram na intenção (sem nova chamada de IA). */
export function applyAnswers(intent: DroneIntent, respostas: Answers): DroneIntent {
  const r = { ...intent };
  const objetivo = respostas.objetivo;
  if (
    objetivo === "filmar" ||
    objetivo === "aprender" ||
    objetivo === "freestyle" ||
    objetivo === "corrida"
  )
    r.finalidade = objetivo;
  const onde = respostas.onde;
  if (onde === "dentro_de_casa" || onde === "ao_ar_livre" || onde === "os_dois") r.ambiente = onde;
  if (respostas.orcamento) {
    const v = Number(respostas.orcamento);
    if (Number.isFinite(v) && v > 0) {
      r.orcamento_max_brl = v;
      r.orcamento_inclui_ferramentas = true;
    }
  }
  const celular = respostas.celular;
  if (celular === "android" || celular === "ios" || celular === "desconhecido") r.celular = celular;
  if (respostas.controle === "celular_experimental") r.controle_pelo_celular = true;
  return r;
}

// ---------------------------------------------------------------------------
// Escolha do arquétipo
// ---------------------------------------------------------------------------

export type ArchetypeChoice =
  | { tipo: "arquetipo"; id: ArchetypeId; motivos: string[] }
  /** Pedido de carga: nenhum arquétipo da v1 serve (o motor de cálculo mostra os números). */
  | { tipo: "carga" }
  /** Ainda não dá para escolher: faltam informações essenciais. */
  | { tipo: "indefinido" };

export function chooseArchetype(i: DroneIntent): ArchetypeChoice {
  if (i.finalidade === "carga" || (i.carga_kg !== null && i.carga_kg > 0)) return { tipo: "carga" };

  if (i.ambiente === "dentro_de_casa" || (i.limite_peso_g !== null && i.limite_peso_g <= 250)) {
    const motivos = [
      i.ambiente === "dentro_de_casa"
        ? "Você quer voar dentro de casa: o drone precisa ser pequeno, leve e ter as hélices protegidas."
        : "Você pediu um drone de até 250 g.",
      "O Tiny Whoop pesa poucas dezenas de gramas e tem as hélices dentro de dutos: aguenta batidas e machuca muito menos.",
    ];
    if (i.gps)
      motivos.push("GPS não funciona bem dentro de casa, por isso ele não entra neste projeto.");
    return { tipo: "arquetipo", id: ARCHETYPE_IDS.whoop, motivos };
  }

  if (i.finalidade === "corrida" || i.finalidade === "freestyle" || i.quer_velocidade) {
    return {
      tipo: "arquetipo",
      id: ARCHETYPE_IDS.fpv,
      motivos: [
        i.finalidade === "freestyle"
          ? "Você quer fazer manobras: o FPV 5 polegadas é o formato feito para isso."
          : "Você quer velocidade: o FPV 5 polegadas é o formato usado em corridas e acrobacias.",
        "Ele é pilotado com óculos, vendo pela câmera do drone, e exige treino no simulador antes do primeiro voo.",
      ],
    };
  }

  const querGps =
    i.gps === true ||
    i.retorno_automatico === true ||
    i.controle_pelo_celular === true ||
    i.estabilizacao === true;
  if (i.finalidade === "filmar" || querGps || i.camera === "gravar") {
    const motivos: string[] = [];
    if (i.finalidade === "filmar")
      motivos.push("Você quer filmar: o drone precisa ser estável e fácil de controlar.");
    if (i.retorno_automatico || i.gps)
      motivos.push(
        "Com GPS, ele segura a posição sozinho e volta para o ponto de decolagem se perder o sinal ou a bateria ficar fraca.",
      );
    if (i.controle_pelo_celular)
      motivos.push(
        "O celular vira a tela de controle (mapa, bateria, voltar para casa); pilotar só pelo celular fica como opção experimental.",
      );
    motivos.push(
      "A classe 450 mm é a mais fácil e segura para quem começa entre as que têm GPS, e tem espaço para montar.",
    );
    return { tipo: "arquetipo", id: ARCHETYPE_IDS.gps, motivos };
  }

  if (i.finalidade === "aprender" && (i.ambiente === "ao_ar_livre" || i.ambiente === "os_dois")) {
    return {
      tipo: "arquetipo",
      id: ARCHETYPE_IDS.gps,
      motivos: [
        "Para aprender ao ar livre, um drone com GPS segura a posição sozinho e volta para casa se algo der errado.",
        "A classe 450 mm é estável e tem espaço para montar com calma.",
      ],
    };
  }
  if (i.pequeno && i.finalidade === "aprender") {
    return {
      tipo: "arquetipo",
      id: ARCHETYPE_IDS.whoop,
      motivos: [
        "Você quer um drone pequeno para aprender: o Tiny Whoop é o jeito mais seguro e barato de começar.",
      ],
    };
  }
  return { tipo: "indefinido" };
}

/**
 * Perguntas que faltam (no máximo 5). Sem arquétipo definido: objetivo, onde e orçamento. Com o
 * Arquétipo 1: Android ou iPhone e o tipo de controle, quando a pessoa falou em celular.
 */
export function pendingQuestions(
  i: DroneIntent,
  escolha: ArchetypeChoice,
  respostas: Answers,
): Question[] {
  const ids: QuestionId[] = [];
  const falta = (id: QuestionId) => respostas[id] === undefined;
  if (escolha.tipo === "indefinido") {
    if (
      falta("objetivo") &&
      (i.finalidade === "nao_informado" || i.finalidade === "lazer" || i.finalidade === "outro")
    )
      ids.push("objetivo");
    if (falta("onde") && i.ambiente === "nao_informado") ids.push("onde");
    if (falta("orcamento") && i.orcamento_max_brl === null) ids.push("orcamento");
  }
  if (escolha.tipo === "arquetipo" && escolha.id === ARCHETYPE_IDS.gps) {
    const falouEmCelular = i.controle_pelo_celular === true || i.celular !== "desconhecido";
    if (falta("controle") && i.controle_pelo_celular === true) ids.push("controle");
    if (falta("celular") && i.celular === "desconhecido" && falouEmCelular) ids.push("celular");
  }
  return ids.slice(0, MAX_QUESTIONS).map((id) => QUESTIONS[id]);
}

// ---------------------------------------------------------------------------
// Opções do build e suposições
// ---------------------------------------------------------------------------

/**
 * Como a intenção vira as opções do build (o solver valida as regras com elas). Só vai o que
 * difere do padrão do solver, que já assume Android (SPEC B.2.1) e escolhe a telemetria pelo
 * ADR-0017: sem pedido especial, o resultado é igual ao build de referência.
 */
export function buildOptionsFor(
  i: DroneIntent,
  id: ArchetypeId,
  respostas: Answers,
): Partial<BuildOptions> {
  const o: Partial<BuildOptions> = {};
  if (id === ARCHETYPE_IDS.gps) {
    if (respostas.controle === "celular_experimental") o.controle = "celular_experimental";
    if (i.celular !== "desconhecido") o.celular = i.celular;
  }
  if (i.uso_comercial) o.uso = "nao_recreativo";
  return o;
}

/** O que foi assumido sem a pessoa dizer (SPEC B.10: "mostre quais foram as suposições"). */
export function assumptions(
  i: DroneIntent,
  id: ArchetypeId | undefined,
  respostas: Answers,
): string[] {
  const s: string[] = [];
  if (i.orcamento_max_brl === null)
    s.push(
      "Você não disse um orçamento: mostramos as três faixas de preço (econômica, equilibrada e premium).",
    );
  else if (i.orcamento_inclui_ferramentas === null)
    s.push(
      "Consideramos que o orçamento inclui as ferramentas (quem começa do zero precisa comprá-las).",
    );
  if (i.ja_tem_ferramentas !== true)
    s.push(
      'Consideramos que você ainda não tem ferramentas; marque "já tenho" na lista para tirá-las do custo.',
    );
  if (id === ARCHETYPE_IDS.gps) {
    if (i.celular === "desconhecido" && respostas.celular === undefined)
      s.push(
        "Consideramos um celular Android: com iPhone, o vídeo pelo USB e o app de controle não funcionam do mesmo jeito.",
      );
    if (respostas.controle !== "celular_experimental")
      s.push(
        "Controle principal pelo rádio, com o celular como tela de mapa e bateria (o mais seguro).",
      );
  }
  if (id && id !== ARCHETYPE_IDS.gps)
    s.push(
      "O vídeo é visto em óculos FPV, e a regra exige um observador ao seu lado vendo o drone.",
    );
  if (i.uso_comercial)
    s.push("Consideramos uso não recreativo (trabalho ou serviço pago), que tem regras próprias.");
  return s;
}
