/*
 * Segurança do pedido (SPEC B.9). Camada 1: pré-filtro determinístico (palavras e padrões) para os
 * casos óbvios; a camada 2 (classificação pelo LLM) pega o que escapar daqui. Bloquear sempre:
 * armas, químicos, interferência em sinais, vigilância invasiva e ocultação de autoridades. A
 * recusa é respeitosa, explica o porquê e, quando existe, sugere uma alternativa legítima.
 */

export const BLOCKED_CATEGORIES = [
  "armas",
  "quimicos",
  "interferencia",
  "vigilancia",
  "ocultacao",
] as const;
export type BlockedCategory = (typeof BLOCKED_CATEGORIES)[number];

export type Refusal = {
  categoria: BlockedCategory;
  titulo: string;
  explicacao: string;
  alternativa?: string;
};

export const REFUSALS: Record<BlockedCategory, Omit<Refusal, "categoria">> = {
  armas: {
    titulo: "Não ajudamos a fazer drones que possam ferir pessoas",
    explicacao:
      "Soltar objetos sobre pessoas, lançar projéteis ou carregar explosivos ou materiais incendiários transforma o drone numa arma. O From Scratch recusa qualquer projeto assim, mesmo como brincadeira ou teste.",
    alternativa:
      "Se a ideia é aprender a pilotar com precisão, um drone pequeno para treinar dentro de casa é um ótimo começo.",
  },
  quimicos: {
    titulo: "Não ajudamos a montar drones para espalhar produtos químicos",
    explicacao:
      "Pulverizar agrotóxicos, venenos ou outros químicos com drone é uma atividade profissional regulamentada e perigosa para pessoas, animais e o ambiente. O From Scratch não ensina a montar drones para isso.",
    alternativa:
      "Se o interesse é a plantação, um drone com câmera para observar e fotografar a área de cima é um projeto possível.",
  },
  interferencia: {
    titulo: "Não ajudamos com bloqueadores de sinal nem com burlar regras de voo",
    explicacao:
      "Bloqueadores de sinal (jammers), interferir em outros drones ou aeronaves e desativar a cerca virtual (geofence) ou a identificação remota põem em risco quem está no ar e no chão, e afetam outros serviços de rádio.",
    alternativa:
      "Se o problema é um drone invadindo a sua propriedade, o caminho é registrar a ocorrência e acionar as autoridades.",
  },
  vigilancia: {
    titulo: "Não ajudamos a vigiar pessoas",
    explicacao:
      "Usar um drone para observar ou filmar uma pessoa específica sem que ela saiba invade a privacidade dela. O From Scratch recusa projetos com esse objetivo.",
    alternativa:
      "Para filmar paisagens, a sua própria casa ou eventos com a autorização das pessoas, um drone de filmagem com GPS é um bom projeto.",
  },
  ocultacao: {
    titulo: "Não ajudamos a esconder um drone das autoridades",
    explicacao:
      "Modificar o drone para não ser detectado ou identificado (tirar a identificação, fugir de radar, apagar registros) serve para escapar das regras de voo, que existem para proteger as pessoas.",
    alternativa:
      "Se a preocupação é voar dentro das regras, o app mostra o que é preciso (cadastro, autorização de voo, homologação) na aba Segurança do projeto.",
  },
};

/**
 * Recusa quando a classificação pelo LLM bloqueia sem dizer uma das categorias acima, ou quando o
 * próprio modelo se recusa a analisar o pedido.
 */
export const GENERIC_REFUSAL: Omit<Refusal, "categoria"> = {
  titulo: "Não podemos ajudar com este pedido",
  explicacao:
    "O objetivo deste pedido entra no que o From Scratch não atende: drones para ferir pessoas, espalhar químicos, interferir em sinais, vigiar pessoas ou fugir das autoridades.",
  alternativa:
    "Se entendemos errado, descreva de novo o que você quer fazer com o drone (filmar, aprender, fazer manobras...).",
};

/** Minúsculas e sem acento, para os padrões não dependerem de como a pessoa escreveu. */
export function normalizeText(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/*
 * Padrões sobre o texto normalizado. Cada um é estreito de propósito (verbo + objeto perigoso),
 * para não recusar pedidos legítimos ("bomba de água", "soltar a pipa"). Os casos sutis ficam
 * para a classificação pelo LLM.
 */
const PESSOAS = "(pessoas?|gente|alguem|multidao|vizinh[oa]s?|policia(is)?|crianca)";
const PATTERNS: Record<BlockedCategory, RegExp[]> = {
  armas: [
    new RegExp(
      `\\b(solt|jog|lanc|derrub|atir|arremess)\\w*\\b.{0,40}\\b(em|nas?|nos?|sobre|contra)\\s+(as\\s+|os\\s+|uma?\\s+)?${PESSOAS}`,
    ),
    // "armado" fica de fora de propósito: é o estado normal do drone pronto para voar.
    /\b(arma|armas|explosiv\w*|granada|bomba|incendiari\w*|lanca[- ]?chamas|molotov|municao|projetil|projeteis)\b/,
    /\b(atir\w*|dispar\w*)\b.{0,30}\b(tiro|bala|projetil|chumbo|flecha|dardo)/,
    new RegExp(`\\b(ferir|machucar|atacar|matar)\\b.{0,30}${PESSOAS}`),
  ],
  quimicos: [
    /\b(pulveriz|borrif|espalh|dispers|aplic)\w*\b.{0,40}\b(veneno|agrotox\w*|pesticid\w*|herbicid\w*|inseticid\w*|defensiv\w*|quimic\w*|gas|gases|acido)/,
    /\b(veneno|agrotox\w*|pesticid\w*|herbicid\w*)\b.{0,40}\b(plantacao|lavoura|roca|pasto|fazenda|horta)/,
  ],
  interferencia: [
    /\b(bloqueador|bloquear|jammer|jamm\w*|embaralh\w*)\b.{0,30}\b(sinal|sinais|drones?|gps|radio|celular|wi-?fi)/,
    /\b(derrubar|abater|neutralizar|interferir|hackear|sequestrar)\b.{0,30}\b(drones?|aeronaves?|avi(ao|oes))/,
    /\b(burlar|desativar|desligar|contornar|driblar|hackear|tirar)\b.{0,30}\b(geofenc\w*|cerca virtual|identificacao remota|remote ?id|limite de altitude)/,
  ],
  vigilancia: [
    // "seguir"/"monitorar" ficam para o LLM: "um drone que me siga" (filmar a si mesmo) é legítimo.
    /\b(vigiar|espionar|espiar|bisbilhot\w*|perseguir|filmar escondido)\b.{0,40}\b(minha|meu|a|o|uma?|aquela|aquele)?\s*(vizinh[oa]|ex|namorad[oa]|espos[oa]|marido|mulher|pessoa|alguem|colega|chefe)\b/,
    /\b(sem (ela|ele|a pessoa|eles|elas) (saber|perceber|ver))\b/,
    /\b(espionagem|espiao)\b/,
  ],
  ocultacao: [
    /\b(esconder|ocultar|despistar|fugir)\b.{0,30}\b(policia|autoridades?|fiscaliza\w*|anac|decea|radar)/,
    /\b(invisivel|indetectavel|nao (ser|seja) (detectado|rastreado|identificado))\b/,
    /\b(tirar|remover|apagar|raspar)\b.{0,30}\b(identificacao|numero de serie|registro|cadastro|etiqueta da anac)/,
  ],
};

export type PrefilterResult = { bloqueado: false } | { bloqueado: true; recusa: Refusal };

/** Camada 1 da SPEC B.9: bloqueia os casos óbvios antes de gastar uma chamada de IA. */
export function prefilterRequest(pedido: string): PrefilterResult {
  const texto = normalizeText(pedido);
  for (const categoria of BLOCKED_CATEGORIES) {
    if (PATTERNS[categoria].some((p) => p.test(texto))) {
      return { bloqueado: true, recusa: { categoria, ...REFUSALS[categoria] } };
    }
  }
  return { bloqueado: false };
}
