import { SRC } from "./sources";

/*
 * Heurísticas do motor de cálculo (SPEC B.7). Todas configuráveis: o domínio recebe este objeto
 * por parâmetro, então dá para testar e ajustar sem mudar o código das regras.
 * Cada valor tem a origem documentada ao lado.
 */
export const DEFAULT_DRONE_CONFIG = {
  massa: {
    /** Margem de fios, parafusos, solda, abraçadeiras e etiquetas sobre a soma das peças.
     *  SPEC B.7 sugere 5–10%; usamos 8% (ajustável). */
    margem_fios_parafusos: 0.08,
  },
  twr: {
    /** Abaixo disso o drone não voa com segurança (SPEC B.7). Corresponde, nas tabelas de
     *  empuxo usuais, a pairar perto do máximo do motor, sem folga para corrigir. */
    minimo_seguro: 2,
    /** Faixas indicativas (SPEC B.7). */
    filmagem: [2, 3] as const,
    uso_geral: [3, 5] as const,
    freestyle_acima_de: 5,
  },
  hover: {
    /** O ArduPilot recomenda pairar "idealmente perto de 50% do acelerador" (Safety page).
     *  Acima deste valor avisamos que sobra pouca potência para correções e vento. */
    alerta_acima_de_pct: 60,
    ideal_pct: 50,
  },
  esc: {
    /** Corrente contínua do ESC ≥ corrente máxima do motor × margem (SPEC B.7). */
    margem_corrente: 1.2,
  },
  bateria: {
    /** Capacidade (Ah) × C ≥ corrente máxima × margem (SPEC B.7). O C impresso costuma ser
     *  otimista, por isso a margem. */
    margem_c: 1.2,
    /** Fração da capacidade que se usa sem danificar a LiPo (SPEC B.7: ex. 0,8). A faixa
     *  mínima considera pousar mais cedo (reserva maior). */
    fracao_utilizavel: [0.7, 0.8] as const,
    /** Tensão nominal por célula (V). LiPo 3,7 V; LiHV 3,8 V; Li-ion 3,6 V. */
    tensao_nominal_celula_v: { LiPo: 3.7, LiHV: 3.8, "Li-ion": 3.6 } as const,
  },
  autonomia: {
    /** Corrente média de voo real em relação à de pairar: voo calmo ≈ 1,0; com manobras e vento
     *  sobe. A faixa vira a faixa de autonomia mostrada como ⚠️. */
    fator_corrente_voo: [1.0, 1.25] as const,
    /** Eficiência dos reguladores (BEC) ao alimentar eletrônicos a partir da bateria. */
    eficiencia_bec: 0.85,
  },
  bec: {
    /** Usar no máximo 80% da corrente do regulador (folga para picos do VTX e aquecimento). */
    uso_maximo: 0.8,
  },
  bussola: {
    /** ArduPilot: afastar o módulo GPS+bússola "pelo menos 10 cm" de fios de potência e bateria;
     *  "mastro altamente recomendado". */
    distancia_min_mm: 100,
  },
  ardupilot: {
    /** Placas F4 de 1 MB rodam firmware reduzido e podem falhar em calibração de bússola por
     *  falta de RAM (Firmware Limitations). Para o drone com GPS de um iniciante exigimos 2 MB. */
    flash_min_mb: 2,
  },
  regras_voo_recreativo: {
    /** DECEA ICA 100-40/2026, art. 32: operação recreativa até 200 ft (60 m) AGL e 300 m. */
    altura_max_m: 60,
    distancia_max_m: 300,
  },
  fontes: {
    massa: SRC.spec,
    twr: SRC.spec,
    hover: SRC.ardupilotSafety,
    esc: SRC.spec,
    bateria: SRC.spec,
    bussola: SRC.ardupilotGpsCompass,
    flash: SRC.ardupilotLimitedFirmware,
    regras_voo_recreativo: SRC.deceaIca10040,
  },
} as const;

export type DroneConfig = typeof DEFAULT_DRONE_CONFIG;
