import { REGULATORY_DISCLAIMER, type SafetyAlert } from "@/domain/core/safety";

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
      "Ligue a bateria pela primeira vez através do smoke stopper, sem hélices.",
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

export const GLOBAL_ALERT_IDS: readonly string[] = GLOBAL_ALERTS.map((a) => a.id);
