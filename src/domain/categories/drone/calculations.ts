import { deriveStatus, type VerificationStatus } from "@/domain/core/verification";

import { type Build, GROUND_CATEGORIES, firstOf, fcOf, receiverOf } from "./build";
import type { DroneConfig } from "./config";
import type { Component, ThrustData, ThrustPoint } from "./schema";

/*
 * Motor de cálculo (SPEC B.7). Funções puras: recebem o build, as tabelas de empuxo e a
 * configuração; devolvem números com selo de confiança e a lista do que faltou.
 * Nenhum número aqui vem de LLM: tudo sai do catálogo e destas fórmulas.
 */

// ---------------------------------------------------------------------------
// Peso de decolagem (AUW)
// ---------------------------------------------------------------------------

export type AuwResult = {
  /** Massa total estimada (g), já com a margem de fios e parafusos. Ausente se faltou massa de alguma peça. */
  massa_total_g?: number;
  /** Soma das massas conhecidas (g). */
  massa_pecas_g: number;
  margem_g: number;
  /** Peças que voam e não têm massa no catálogo. */
  faltando: string[];
  /** Peças cuja massa foi estimada (massa_estimada_g), não publicada. */
  estimadas: string[];
  selo: VerificationStatus;
};

export function computeAuw(build: Build, config: DroneConfig): AuwResult {
  let massaPecas = 0;
  const faltando: string[] = [];
  const estimadas: string[] = [];
  const selos: VerificationStatus[] = [];
  for (const item of build.itens) {
    if (GROUND_CATEGORIES.has(item.componente.categoria)) continue;
    if (item.quantidade_no_drone <= 0) continue;
    const publicada = item.componente.massa_g;
    const estimada = item.componente.massa_estimada_g?.valor;
    const massa = publicada ?? estimada;
    if (massa === undefined) {
      faltando.push(item.componente.id);
      continue;
    }
    if (publicada === undefined) {
      estimadas.push(item.componente.id);
      selos.push("estimativa");
    }
    massaPecas += massa * item.quantidade_no_drone;
    selos.push(item.componente.status_verificacao);
  }
  const margem = massaPecas * config.massa.margem_fios_parafusos;
  return {
    massa_total_g: faltando.length === 0 ? massaPecas + margem : undefined,
    massa_pecas_g: massaPecas,
    margem_g: margem,
    faltando,
    estimadas,
    selo: faltando.length === 0 ? deriveStatus(selos, "estimativa") : "nao_verificado",
  };
}

// ---------------------------------------------------------------------------
// Curva de empuxo
// ---------------------------------------------------------------------------

function sortedPoints(table: ThrustData): ThrustPoint[] {
  return [...table.pontos].sort((a, b) => a.throttle_pct - b.throttle_pct);
}

/** Interpolação linear de y em função de x, só dentro da faixa medida (sem extrapolar). */
function interpolate(
  points: readonly ThrustPoint[],
  x: number,
  getX: (p: ThrustPoint) => number,
  getY: (p: ThrustPoint) => number,
): number | undefined {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const xa = getX(a);
    const xb = getX(b);
    if (x >= xa && x <= xb) {
      if (xb === xa) return getY(a);
      return getY(a) + ((getY(b) - getY(a)) * (x - xa)) / (xb - xa);
    }
  }
  return undefined;
}

export function maxPoint(table: ThrustData): ThrustPoint | undefined {
  const points = sortedPoints(table);
  return points[points.length - 1];
}

/** Empuxo (g) de um motor num certo throttle (%), dentro da faixa da tabela. */
export function thrustAt(table: ThrustData, throttlePct: number): number | undefined {
  return interpolate(
    sortedPoints(table),
    throttlePct,
    (p) => p.throttle_pct,
    (p) => p.empuxo_g,
  );
}

export type OperatingPoint = {
  throttle_pct: number;
  corrente_a: number;
  /** "abaixo_da_tabela": o ponto pedido é menor que o primeiro medido; usamos o primeiro ponto
   *  como limite superior (estimativa conservadora: throttle e corrente reais são menores). */
  precisao: "interpolado" | "abaixo_da_tabela";
};

/** Throttle e corrente de um motor para produzir um certo empuxo (g). Undefined = não alcança. */
export function operatingPointFor(table: ThrustData, empuxoG: number): OperatingPoint | undefined {
  const points = sortedPoints(table);
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return undefined;
  if (empuxoG > last.empuxo_g) return undefined;
  if (empuxoG < first.empuxo_g) {
    return {
      throttle_pct: first.throttle_pct,
      corrente_a: first.corrente_a,
      precisao: "abaixo_da_tabela",
    };
  }
  const throttle = interpolate(
    points,
    empuxoG,
    (p) => p.empuxo_g,
    (p) => p.throttle_pct,
  );
  const corrente = interpolate(
    points,
    empuxoG,
    (p) => p.empuxo_g,
    (p) => p.corrente_a,
  );
  if (throttle === undefined || corrente === undefined) return undefined;
  return { throttle_pct: throttle, corrente_a: corrente, precisao: "interpolado" };
}

/** Acha a tabela de empuxo do conjunto motor + hélice + nº de células do build. */
export function findThrustTable(
  build: Build,
  tables: readonly ThrustData[],
): ThrustData | undefined {
  const motor = firstOf(build, "motor")?.componente;
  const prop = firstOf(build, "helice")?.componente;
  const cells = firstOf(build, "bateria")?.componente.specs.celulas;
  if (!motor || !prop || cells === undefined) return undefined;
  return tables.find(
    (t) => t.motor_id === motor.id && t.helice_id === prop.id && t.celulas === cells,
  );
}

// ---------------------------------------------------------------------------
// Propulsão: empuxo, TWR, hover e correntes
// ---------------------------------------------------------------------------

export type PropulsionResult = {
  tabela_id?: string;
  motores: number;
  empuxo_max_por_motor_g?: number;
  empuxo_total_g?: number;
  /** Throttle máximo coberto pela tabela (normalmente 100%). */
  throttle_max_tabela_pct?: number;
  twr?: number;
  /** Undefined quando não há dado; false quando o empuxo total não sustenta o peso. */
  paira?: boolean;
  hover?: OperatingPoint;
  corrente_max_por_motor_a?: number;
  corrente_max_total_a?: number;
  corrente_hover_motores_a?: number;
  selo: VerificationStatus;
  faltando: string[];
};

export function computePropulsion(
  build: Build,
  tables: readonly ThrustData[],
  auw: AuwResult,
): PropulsionResult {
  const motores = firstOf(build, "motor")?.quantidade_no_drone ?? 0;
  const faltando: string[] = [];
  const table = findThrustTable(build, tables);
  if (!table) faltando.push("tabela de empuxo (motor + hélice + células)");
  if (auw.massa_total_g === undefined) faltando.push("massa de todas as peças");
  if (motores === 0) faltando.push("motores");
  if (!table || motores === 0) {
    return { motores, selo: "nao_verificado", faltando };
  }

  const top = maxPoint(table);
  const empuxoMax = top?.empuxo_g;
  const correnteMax = top?.corrente_a;
  const result: PropulsionResult = {
    tabela_id: table.id,
    motores,
    empuxo_max_por_motor_g: empuxoMax,
    empuxo_total_g: empuxoMax !== undefined ? empuxoMax * motores : undefined,
    throttle_max_tabela_pct: top?.throttle_pct,
    corrente_max_por_motor_a: correnteMax,
    corrente_max_total_a: correnteMax !== undefined ? correnteMax * motores : undefined,
    selo: deriveStatus(
      [
        table.status_verificacao,
        auw.selo,
        firstOf(build, "motor")?.componente.status_verificacao ?? "nao_verificado",
      ],
      "estimativa",
    ),
    faltando,
  };

  if (auw.massa_total_g !== undefined && result.empuxo_total_g !== undefined) {
    result.twr = result.empuxo_total_g / auw.massa_total_g;
    const hover = operatingPointFor(table, auw.massa_total_g / motores);
    result.paira = hover !== undefined;
    if (hover) {
      result.hover = hover;
      result.corrente_hover_motores_a = hover.corrente_a * motores;
    }
  } else {
    result.selo = "nao_verificado";
  }
  return result;
}

// ---------------------------------------------------------------------------
// Bateria e alimentação dos eletrônicos
// ---------------------------------------------------------------------------

export function nominalBatteryVoltage(
  battery: Extract<Component, { categoria: "bateria" }>,
  config: DroneConfig,
): number | undefined {
  const { celulas, quimica = "LiPo" } = battery.specs;
  if (celulas === undefined) return undefined;
  return celulas * config.bateria.tensao_nominal_celula_v[quimica];
}

/** Tensão da bateria em uso: [mínima sob carga, cheia]. */
export function batteryVoltageRange(
  battery: Extract<Component, { categoria: "bateria" }>,
  config: DroneConfig,
): readonly [number, number] | undefined {
  const { celulas, quimica = "LiPo" } = battery.specs;
  if (celulas === undefined) return undefined;
  const [min, max] = config.bateria.tensao_celula_faixa_v[quimica];
  return [celulas * min, celulas * max];
}

/** Um consumidor de energia de 5 V/9 V/12 V (receptor, GPS, VTX...). */
export type PowerLoad = {
  componente_id: string;
  categoria: string;
  tensao_min_v?: number;
  tensao_max_v?: number;
  corrente_a?: number;
};

export type PowerAssignment = PowerLoad & {
  /** true se a corrente veio do consumo presumido (o fabricante não publica). */
  corrente_presumida?: boolean;
  /** De onde vem a energia: um BEC da FC (índice) ou direto da bateria. */
  fonte:
    | { tipo: "bec"; indice: number; tensao_v: number }
    | { tipo: "bateria"; tensao_v: number }
    | null;
};

export type PowerPlan = {
  atribuicoes: PowerAssignment[];
  /** Corrente somada em cada BEC da FC (A). */
  carga_por_bec_a: number[];
  /** Corrente que os eletrônicos puxam da bateria (A), estimada pela potência. */
  corrente_eletronicos_bateria_a?: number;
  sem_dado: string[];
  /** Peças cuja corrente foi presumida (config.consumo_presumido_ma). */
  presumidos: string[];
};

/** Lista os consumidores que precisam de alimentação regulada. */
export function powerLoadsOf(build: Build): PowerLoad[] {
  const loads: PowerLoad[] = [];
  const rx = receiverOf(build);
  if (rx && rx.componente.categoria === "receptor") {
    loads.push({
      componente_id: rx.componente.id,
      categoria: "receptor",
      tensao_min_v: rx.specs.tensao_v_min,
      tensao_max_v: rx.specs.tensao_v_max,
      corrente_a: rx.specs.corrente_ma !== undefined ? rx.specs.corrente_ma / 1000 : undefined,
    });
  }
  const gps = firstOf(build, "gps")?.componente;
  if (gps) {
    loads.push({
      componente_id: gps.id,
      categoria: "gps",
      tensao_min_v: gps.specs.tensao_v,
      tensao_max_v: gps.specs.tensao_v,
      corrente_a: gps.specs.corrente_ma !== undefined ? gps.specs.corrente_ma / 1000 : undefined,
    });
  }
  const telem = firstOf(build, "telemetria")?.componente;
  if (telem) {
    loads.push({
      componente_id: telem.id,
      categoria: "telemetria",
      tensao_min_v: telem.specs.tensao_v,
      tensao_max_v: telem.specs.tensao_v,
      corrente_a:
        telem.specs.corrente_ma !== undefined ? telem.specs.corrente_ma / 1000 : undefined,
    });
  }
  const cam = firstOf(build, "camera_fpv")?.componente;
  if (cam) {
    loads.push({
      componente_id: cam.id,
      categoria: "camera_fpv",
      tensao_min_v: cam.specs.tensao_v_min,
      tensao_max_v: cam.specs.tensao_v_max,
      corrente_a: cam.specs.corrente_ma !== undefined ? cam.specs.corrente_ma / 1000 : undefined,
    });
  }
  const vtx = firstOf(build, "vtx")?.componente;
  if (vtx) {
    loads.push({
      componente_id: vtx.id,
      categoria: "vtx",
      tensao_min_v: vtx.specs.tensao_v_min,
      tensao_max_v: vtx.specs.tensao_v_max,
      corrente_a:
        vtx.specs.corrente_ma_max !== undefined ? vtx.specs.corrente_ma_max / 1000 : undefined,
    });
  }
  return loads;
}

function fits(load: PowerLoad, tensao: number): boolean {
  if (load.tensao_min_v === undefined || load.tensao_max_v === undefined) return false;
  return tensao >= load.tensao_min_v - 1e-9 && tensao <= load.tensao_max_v + 1e-9;
}

/**
 * Decide de onde cada eletrônico tira energia: o BEC da FC de menor tensão que serve (5 V antes
 * de 9 V, por exemplo) ou, se nenhum servir, direto da bateria (comum em VTX que aceita 2–6S).
 * Em AIOs de whoop a alimentação é interna: os consumidores do próprio AIO não entram aqui.
 */
export function planPowerSupply(build: Build, config: DroneConfig): PowerPlan {
  const fc = fcOf(build);
  const becs = fc?.specs.becs ?? [];
  const battery = firstOf(build, "bateria")?.componente;
  const vBatt = battery ? nominalBatteryVoltage(battery, config) : undefined;
  const faixaBatt = battery ? batteryVoltageRange(battery, config) : undefined;
  const order = becs
    .map((bec, indice) => ({ ...bec, indice }))
    .sort((a, b) => a.tensao_v - b.tensao_v);

  const carga = becs.map(() => 0);
  const semDado: string[] = [];
  const presumidos: string[] = [];
  const atribuicoes: PowerAssignment[] = powerLoadsOf(build).map((original) => {
    let load: PowerLoad & { corrente_presumida?: boolean } = original;
    if (load.corrente_a === undefined) {
      const presumido = config.consumo_presumido_ma[load.categoria];
      if (presumido !== undefined) {
        load = { ...load, corrente_a: presumido / 1000, corrente_presumida: true };
        presumidos.push(load.componente_id);
      }
    }
    if (load.tensao_min_v === undefined || load.tensao_max_v === undefined) {
      semDado.push(load.componente_id);
      return { ...load, fonte: null };
    }
    const bec = order.find((b) => fits(load, b.tensao_v));
    if (bec) {
      if (load.corrente_a === undefined) semDado.push(load.componente_id);
      carga[bec.indice] = (carga[bec.indice] ?? 0) + (load.corrente_a ?? 0);
      return {
        ...load,
        fonte: { tipo: "bec" as const, indice: bec.indice, tensao_v: bec.tensao_v },
      };
    }
    // Direto na bateria só se a peça aguentar a bateria cheia e funcionar com ela quase vazia.
    if (
      vBatt !== undefined &&
      faixaBatt &&
      load.tensao_min_v <= faixaBatt[0] + 1e-9 &&
      load.tensao_max_v >= faixaBatt[1] - 1e-9
    ) {
      if (load.corrente_a === undefined) semDado.push(load.componente_id);
      return { ...load, fonte: { tipo: "bateria" as const, tensao_v: vBatt } };
    }
    return { ...load, fonte: null };
  });

  let correnteBateria: number | undefined;
  if (vBatt !== undefined) {
    let potencia = 0;
    for (const a of atribuicoes) {
      if (!a.fonte || a.corrente_a === undefined) continue;
      potencia += a.fonte.tensao_v * a.corrente_a;
    }
    correnteBateria = potencia / (vBatt * config.autonomia.eficiencia_bec);
  }
  return {
    atribuicoes,
    carga_por_bec_a: carga,
    corrente_eletronicos_bateria_a: correnteBateria,
    sem_dado: semDado,
    presumidos,
  };
}

// ---------------------------------------------------------------------------
// Autonomia (tempo de voo)
// ---------------------------------------------------------------------------

export type FlightTimeResult = {
  min_minutos?: number;
  max_minutos?: number;
  selo: VerificationStatus;
  premissas: string[];
};

/**
 * Tempo de voo ≈ (capacidade_Ah × fração utilizável) / corrente média × 60 (SPEC B.7).
 * Sempre ⚠️: depende de vento, temperatura, estado da bateria e do jeito de pilotar.
 */
export function computeFlightTime(
  build: Build,
  propulsion: PropulsionResult,
  power: PowerPlan,
  config: DroneConfig,
): FlightTimeResult {
  const battery = firstOf(build, "bateria")?.componente;
  const capacidade = battery?.specs.capacidade_mah;
  const hover = propulsion.corrente_hover_motores_a;
  if (!battery || capacidade === undefined || hover === undefined) {
    return {
      selo: "nao_verificado",
      premissas: ["faltam capacidade da bateria ou corrente em hover"],
    };
  }
  const eletronicos = power.corrente_eletronicos_bateria_a ?? 0;
  const [fracMin, fracMax] = config.bateria.fracao_utilizavel;
  const [fatorMin, fatorMax] = config.autonomia.fator_corrente_voo;
  const ah = capacidade / 1000;
  const correnteCalma = hover * fatorMin + eletronicos;
  const correnteAgitada = hover * fatorMax + eletronicos;
  const premissas = [
    `usa de ${Math.round(fracMin * 100)}% a ${Math.round(fracMax * 100)}% da capacidade (o resto protege a bateria)`,
    `corrente de voo de ${fatorMin}× a ${fatorMax}× a de pairar (vento e manobras aumentam o consumo)`,
  ];
  if (propulsion.hover?.precisao === "abaixo_da_tabela") {
    premissas.push(
      "o ponto de pairar ficou abaixo da tabela: usamos o primeiro ponto medido (estimativa conservadora)",
    );
  }
  if (power.corrente_eletronicos_bateria_a === undefined || power.sem_dado.length > 0) {
    premissas.push("consumo de alguns eletrônicos não informado: autonomia real pode ser menor");
  }
  return {
    min_minutos: ((ah * fracMin) / correnteAgitada) * 60,
    max_minutos: ((ah * fracMax) / correnteCalma) * 60,
    selo: deriveStatus([propulsion.selo, battery.status_verificacao], "estimativa"),
    premissas,
  };
}
