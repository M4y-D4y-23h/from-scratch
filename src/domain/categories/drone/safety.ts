import { REGULATORY_DISCLAIMER, type SafetyAlert } from "@/domain/core/safety";

import { type Build, hasCategory } from "./build";
import type { BuildMetrics } from "./compatibility";
import { conditionMatches } from "./firmware";
import type { Archetype } from "./schema";
import { SRC } from "./sources";

/*
 * Alertas obrigatórios (SPEC B.9) que valem para qualquer drone. São dados do domínio, não texto
 * do LLM. Os alertas específicos de cada arquétipo ficam no catálogo (arquetipos/*.json) e os que
 * dependem do projeto (peso, vídeo, uso) são calculados a partir do build.
 */

const VERIFICADO_EM = "2026-10-04";

export const GLOBAL_ALERTS: readonly SafetyAlert[] = [
  {
    id: "lipo",
    nivel: "perigo",
    titulo: "Baterias LiPo podem pegar fogo",
    texto:
      "A bateria LiPo guarda muita energia. Furada, amassada, estufada, carregada errado ou descarregada demais, ela pode pegar fogo, e esse fogo é difícil de apagar.",
    acoes: [
      "Carregue só com carregador balanceador, sobre superfície que não pega fogo e dentro da bolsa anti-chamas.",
      "Nunca deixe carregando sem ninguém olhando.",
      "Guarde e transporte na bolsa anti-chamas, com a carga de armazenamento (função storage do carregador).",
      "Bateria estufada ou danificada: não use nem carregue; isole e procure o descarte correto.",
    ],
    fontes: [SRC.ardupilotSafety],
    verificado_em: VERIFICADO_EM,
  },
  {
    id: "helices",
    nivel: "perigo",
    titulo: "Hélices cortam: configure e teste sempre sem elas",
    texto:
      "Uma hélice girando pode causar ferimentos graves, inclusive nos olhos. O motor pode ligar sem aviso durante a configuração.",
    acoes: [
      "Tire as hélices antes de ligar a bateria em qualquer configuração ou teste de bancada.",
      "Só coloque as hélices no local de voo, com o drone desarmado e a bateria desconectada.",
      "Se o drone ficar num estado estranho, cubra as hélices com uma toalha e desconecte a bateria.",
    ],
    fontes: [SRC.ardupilotSafety],
    verificado_em: VERIFICADO_EM,
  },
  {
    id: "solda",
    nivel: "atencao",
    titulo: "Solda: queimadura e fumaça",
    texto:
      "A ponta do ferro passa de 300 °C e a fumaça do fluxo irrita olhos e pulmões. Estanho com chumbo exige lavar as mãos.",
    acoes: [
      "Use óculos de proteção e solde em local ventilado.",
      "Apoie o ferro sempre no suporte e desligue ao terminar.",
      "Lave as mãos depois e não coma na bancada.",
    ],
    fontes: [],
    verificado_em: VERIFICADO_EM,
  },
  {
    id: "primeiro-power-on",
    nivel: "atencao",
    titulo: "Primeiro power-on: procure curto antes",
    texto:
      "Na primeira vez que a bateria é ligada, um curto-circuito pode queimar placas na hora ou causar fogo.",
    acoes: [
      "Com o multímetro em continuidade, confira que o positivo e o negativo da entrada de energia não estão ligados entre si.",
      "Ligue a bateria pela primeira vez sem hélices e, se houver smoke stopper para o conector do drone (XT30/XT60), através dele.",
      "Se sair fumaça ou cheiro de queimado, desconecte a bateria imediatamente.",
    ],
    fontes: [],
    verificado_em: VERIFICADO_EM,
  },
  {
    id: "regulamentacao",
    nivel: "regulatorio",
    titulo: "Regras de voo no Brasil (ANAC, DECEA, Anatel)",
    texto: `Antes de voar, confira: cadastro do drone na ANAC (obrigatório acima de 250 g), solicitação de acesso ao espaço aéreo no SARPAS do DECEA, limites do voo recreativo (até 60 m de altura e 300 m de distância, sempre vendo o drone), distância de pessoas e aeroportos, privacidade e homologação dos transmissores pela Anatel. ${REGULATORY_DISCLAIMER}`,
    acoes: [
      "Leia as fontes oficiais abaixo antes do primeiro voo.",
      "Voe sempre vendo o drone com os próprios olhos.",
    ],
    fontes: [
      SRC.anacRes806,
      SRC.anacRes805Rbac100,
      SRC.deceaIca10040,
      SRC.deceaPortal,
      SRC.anatelHomologacao,
    ],
    verificado_em: VERIFICADO_EM,
  },
  {
    id: "pessoas-primeiro",
    nivel: "perigo",
    titulo: "Pessoas primeiro: distância e posição de quem assiste",
    texto:
      "Quedas acontecem por erro de pilotagem ou defeito, e quem está perto do drone corre risco. A segurança das pessoas vem antes do drone.",
    acoes: [
      "Quem assiste fica atrás de você; ninguém entre você e o drone.",
      "Enquanto aprende, mantenha o drone a pelo menos 3 m de você (e não mais que uns 10 m).",
      "Se alguém entrar na área de voo, pouse na hora e só decole com a área livre.",
    ],
    fontes: [SRC.ardupilotSafety],
    verificado_em: VERIFICADO_EM,
  },
  {
    id: "ligar-desligar",
    nivel: "atencao",
    titulo: "Ordem certa de ligar e desligar",
    texto:
      "Com a bateria conectada, trate o drone como armado: os motores podem girar a qualquer momento.",
    acoes: [
      "Ligue o rádio primeiro, com o acelerador todo para baixo; só depois conecte a bateria do drone.",
      "Depois de pousar, desarme e desconecte a bateria antes de desligar o rádio.",
      "Não pegue o drone e o rádio ao mesmo tempo: dá para esbarrar no acelerador.",
      "Não voe além do tempo seguro da bateria: é ruim para ela e pode derrubar o drone.",
    ],
    fontes: [SRC.ardupilotSafety],
    verificado_em: VERIFICADO_EM,
  },
  {
    id: "emergencia",
    nivel: "info",
    titulo: "Se algo der errado",
    texto:
      "Tenha à mão uma toalha grande, um extintor e um kit de primeiros socorros: para o ArduPilot, a toalha é o equipamento de segurança mais importante, seguida do extintor e do kit.",
    acoes: [
      "Drone em estado estranho ou depois de uma queda: jogue a toalha sobre as hélices e desconecte a bateria.",
      "Bateria pegando fogo: afaste as pessoas e não respire a fumaça; se não der para controlar, chame os bombeiros.",
      "Ferimento sério: ligue para o SAMU 192 (gratuito, 24 horas).",
    ],
    fontes: [SRC.ardupilotSafety, SRC.samu192],
    verificado_em: VERIFICADO_EM,
  },
  {
    id: "simulador",
    nivel: "info",
    titulo: "Treine no simulador primeiro",
    texto:
      "Errar no simulador não custa nada. No drone real, um erro quebra peças ou machuca alguém. Use o próprio rádio como controle no computador.",
    acoes: ["Treine decolar, pairar, girar e pousar no simulador antes do primeiro voo real."],
    fontes: [],
    verificado_em: VERIFICADO_EM,
  },
];

/** Um alerta global pelo id (o pipeline do pedido reaproveita os textos com fonte). */
export function globalAlert(id: string): SafetyAlert | undefined {
  return GLOBAL_ALERTS.find((a) => a.id === id);
}

/** Uso não recreativo (RBAC nº 100): no projeto e no pedido ("filmar casamentos"). */
export function nonRecreationalAlert(): SafetyAlert {
  return {
    id: "uso-nao-recreativo" satisfies (typeof DYNAMIC_ALERT_IDS)[number],
    nivel: "regulatorio",
    titulo: "Uso não recreativo segue o RBAC nº 100",
    texto: `Filmagem paga ou qualquer uso que não seja lazer segue o RBAC nº 100 da ANAC (cadastro, seguro e outras exigências) e as regras do DECEA para operações não recreativas. ${REGULATORY_DISCLAIMER}`,
    acoes: ["Leia o RBAC nº 100 antes de usar o drone para trabalho."],
    fontes: [SRC.anacRes805Rbac100, SRC.deceaIca10040],
    verificado_em: VERIFICADO_EM,
  };
}

/** Alertas calculados a partir do build (dynamicAlerts): os passos também podem citá-los. */
const DYNAMIC_ALERT_IDS = ["video-e-visada", "uso-nao-recreativo"] as const;

/** Ids que os passos podem citar além dos alertas do próprio arquétipo. */
export const GLOBAL_ALERT_IDS: readonly string[] = [
  ...GLOBAL_ALERTS.map((a) => a.id),
  ...DYNAMIC_ALERT_IDS,
];

/** Alertas que só aparecem quando a opção do projeto pede (os demais do arquétipo valem sempre). */
const CONDICIONAIS: Record<string, (build: Build, m: BuildMetrics) => boolean> = {
  "celular-experimental": (b) => b.opcoes.controle === "celular_experimental",
  iphone: (b) => b.opcoes.celular !== "android",
  "acima-250g": (_, m) => m.auw.massa_total_g === undefined || m.auw.massa_total_g > 250,
  "ate-250g": (_, m) => m.auw.massa_total_g !== undefined && m.auw.massa_total_g <= 250,
};

/** Alertas globais que só fazem sentido quando algum passo do guia usa a ferramenta. */
const GLOBAIS_POR_FERRAMENTA: Record<string, string> = { solda: "ferro-de-solda" };

/** Alertas calculados a partir das escolhas do projeto. */
function dynamicAlerts(build: Build): SafetyAlert[] {
  const alertas: SafetyAlert[] = [];
  if (hasCategory(build, "receptor_video") || hasCategory(build, "oculos_fpv")) {
    alertas.push({
      id: "video-e-visada" satisfies (typeof DYNAMIC_ALERT_IDS)[number],
      nivel: "regulatorio",
      titulo: "Ver o vídeo não substitui ver o drone",
      texto: `No voo recreativo você precisa ver o drone com os próprios olhos o tempo todo. Se for olhar a tela do celular ou usar óculos FPV, tenha um observador ao seu lado vendo o drone. ${REGULATORY_DISCLAIMER}`,
      acoes: [
        "Olhe para o drone, não para a tela, principalmente na decolagem e no pouso.",
        "Com óculos FPV, voe sempre com um observador.",
      ],
      fontes: [SRC.deceaIca10040],
      verificado_em: VERIFICADO_EM,
    });
  }
  if (build.opcoes.uso === "nao_recreativo") alertas.push(nonRecreationalAlert());
  return alertas;
}

/** Todos os alertas do projeto: globais, do arquétipo (filtrados) e calculados. */
export function projectAlerts(
  build: Build,
  archetype: Archetype,
  metrics: BuildMetrics,
): SafetyAlert[] {
  const doArquetipo = archetype.alertas.filter((a) => CONDICIONAIS[a.id]?.(build, metrics) ?? true);
  const ferramentas = new Set(
    archetype.passos
      .filter((p) => conditionMatches(p.condicao, build))
      .flatMap((p) => p.ferramentas),
  );
  // Montagem sem solda (whoop de encaixe) não mostra o alerta de solda.
  const globais = GLOBAL_ALERTS.filter((a) => {
    const ferramenta = GLOBAIS_POR_FERRAMENTA[a.id];
    return ferramenta === undefined || ferramentas.has(ferramenta);
  });
  const todos = [...globais, ...doArquetipo, ...dynamicAlerts(build)];
  const vistos = new Set<string>();
  return todos.filter((a) => (vistos.has(a.id) ? false : (vistos.add(a.id), true)));
}
