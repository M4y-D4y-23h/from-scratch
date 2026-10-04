import { describe, expect, it } from "vitest";

import {
  baseBuild,
  makeComponent,
  removeSlot,
  THRUST_TABLE,
  tweakSlot,
  withStatus,
} from "./__fixtures__/builds";
import {
  computeAuw,
  computeFlightTime,
  computePropulsion,
  findThrustTable,
  nominalBatteryVoltage,
  operatingPointFor,
  planPowerSupply,
  thrustAt,
} from "./calculations";
import { DEFAULT_DRONE_CONFIG as CONFIG } from "./config";
import type { ThrustData } from "./schema";

/*
 * Os números esperados saem da conta à mão descrita em __fixtures__/builds.ts.
 */

describe("peso de decolagem (AUW)", () => {
  it("soma as peças que voam e aplica a margem de fios e parafusos", () => {
    const auw = computeAuw(baseBuild(), CONFIG);
    expect(auw.massa_pecas_g).toBe(968);
    expect(auw.margem_g).toBeCloseTo(77.44, 6);
    expect(auw.massa_total_g).toBeCloseTo(1045.44, 6);
    expect(auw.faltando).toEqual([]);
  });

  it("rádio e receptor de vídeo ficam no chão: não pesam no drone", () => {
    const semChao = removeSlot(removeSlot(baseBuild(), "radio"), "receptor_video");
    expect(computeAuw(semChao, CONFIG).massa_total_g).toBeCloseTo(1045.44, 6);
  });

  it("peça sem massa no catálogo: não chuta o total e diz o que faltou", () => {
    const build = tweakSlot(baseBuild(), "motores", {}, { massa_g: undefined });
    const auw = computeAuw(build, CONFIG);
    expect(auw.massa_total_g).toBeUndefined();
    expect(auw.faltando).toEqual(["motor-teste"]);
    expect(auw.selo).toBe("nao_verificado");
  });

  it("massa estimada (sem dado do fabricante) entra no peso e fica listada", () => {
    const build = tweakSlot(
      baseBuild(),
      "motores",
      {},
      { massa_g: undefined, massa_estimada_g: { valor: 56, motivo: "comparação" } },
    );
    const auw = computeAuw(build, CONFIG);
    expect(auw.massa_total_g).toBeCloseTo(1045.44, 6);
    expect(auw.estimadas).toEqual(["motor-teste"]);
    expect(auw.faltando).toEqual([]);
  });

  it("peso é estimativa: com tudo verificado o selo vira ⚠️, nunca ✅", () => {
    expect(computeAuw(withStatus(baseBuild(), "verificado"), CONFIG).selo).toBe("estimativa");
  });
});

describe("curva de empuxo", () => {
  it("interpola dentro da tabela", () => {
    expect(thrustAt(THRUST_TABLE, 60)).toBeCloseTo(420, 6);
    expect(thrustAt(THRUST_TABLE, 100)).toBe(850);
  });

  it("não extrapola fora da faixa medida", () => {
    expect(thrustAt(THRUST_TABLE, 10)).toBeUndefined();
  });

  it("acha throttle e corrente para um empuxo pedido", () => {
    const op = operatingPointFor(THRUST_TABLE, 450);
    expect(op?.throttle_pct).toBeCloseTo(62.5, 6);
    expect(op?.corrente_a).toBeCloseTo(5, 6);
    expect(op?.precisao).toBe("interpolado");
  });

  it("abaixo do primeiro ponto usa o primeiro ponto como limite conservador", () => {
    expect(operatingPointFor(THRUST_TABLE, 100)).toEqual({
      throttle_pct: 25,
      corrente_a: 1,
      precisao: "abaixo_da_tabela",
    });
  });

  it("acima do empuxo máximo o motor não alcança", () => {
    expect(operatingPointFor(THRUST_TABLE, 851)).toBeUndefined();
  });

  it("a ordem dos pontos no catálogo não muda o resultado", () => {
    const shuffled: ThrustData = { ...THRUST_TABLE, pontos: [...THRUST_TABLE.pontos].reverse() };
    expect(operatingPointFor(shuffled, 450)).toEqual(operatingPointFor(THRUST_TABLE, 450));
  });

  it("a tabela precisa ser do mesmo motor, hélice e número de células", () => {
    expect(findThrustTable(baseBuild(), [THRUST_TABLE])?.id).toBe("empuxo-teste");
    const quatroS = tweakSlot(baseBuild(), "bateria", { celulas: 4 });
    expect(findThrustTable(quatroS, [THRUST_TABLE])).toBeUndefined();
  });
});

describe("propulsão", () => {
  const propulsionOf = (build = baseBuild(), tables: ThrustData[] = [THRUST_TABLE]) =>
    computePropulsion(build, tables, computeAuw(build, CONFIG));

  it("calcula TWR, ponto de pairar e correntes", () => {
    const p = propulsionOf();
    expect(p.empuxo_total_g).toBe(3400);
    expect(p.twr).toBeCloseTo(3400 / 1045.44, 6);
    expect(p.paira).toBe(true);
    expect(p.hover?.throttle_pct).toBeCloseTo(44.633, 3);
    expect(p.corrente_hover_motores_a).toBeCloseTo(10.2827, 3);
    expect(p.corrente_max_por_motor_a).toBe(11);
    expect(p.corrente_max_total_a).toBe(44);
  });

  it("pesado demais: não paira", () => {
    const p = propulsionOf(tweakSlot(baseBuild(), "bateria", {}, { massa_g: 3000 }));
    expect(p.paira).toBe(false);
    expect(p.hover).toBeUndefined();
    expect(p.twr).toBeLessThan(1);
  });

  it("sem tabela de empuxo: nada é calculado e o motivo aparece", () => {
    const p = propulsionOf(baseBuild(), []);
    expect(p.twr).toBeUndefined();
    expect(p.paira).toBeUndefined();
    expect(p.selo).toBe("nao_verificado");
    expect(p.faltando.join(" ")).toContain("tabela de empuxo");
  });

  it("TWR é estimativa: no melhor caso ⚠️", () => {
    const verified = { ...THRUST_TABLE, status_verificacao: "verificado" as const };
    expect(propulsionOf(withStatus(baseBuild(), "verificado"), [verified]).selo).toBe("estimativa");
    // Tabela não conferida contamina o resultado.
    expect(propulsionOf(withStatus(baseBuild(), "verificado")).selo).toBe("nao_verificado");
  });
});

describe("alimentação dos eletrônicos", () => {
  it("usa o BEC de menor tensão que serve e calcula a carga de cada um", () => {
    const plan = planPowerSupply(baseBuild(), CONFIG);
    const fonteDe = (categoria: string) =>
      plan.atribuicoes.find((a) => a.categoria === categoria)?.fonte;
    expect(fonteDe("receptor")).toMatchObject({ tipo: "bec", tensao_v: 5 });
    expect(fonteDe("gps")).toMatchObject({ tipo: "bec", tensao_v: 5 });
    expect(fonteDe("telemetria")).toMatchObject({ tipo: "bec", tensao_v: 5 });
    // A câmera aceita 4,5–36 V: vai no BEC de 5 V, não no de 9 V.
    expect(fonteDe("camera_fpv")).toMatchObject({ tipo: "bec", tensao_v: 5 });
    // O VTX aceita 7–26 V: vai no BEC de 9 V.
    expect(fonteDe("vtx")).toMatchObject({ tipo: "bec", tensao_v: 9 });
    expect(plan.carga_por_bec_a[0]).toBeCloseTo(0.45, 6);
    expect(plan.carga_por_bec_a[1]).toBeCloseTo(0.5, 6);
    // (5 V × 0,45 A + 9 V × 0,5 A) / (11,1 V × 85%) ≈ 0,715 A tirados da bateria.
    expect(plan.corrente_eletronicos_bateria_a).toBeCloseTo(6.75 / (11.1 * 0.85), 6);
    expect(plan.sem_dado).toEqual([]);
  });

  it("não depende da ordem em que os BECs aparecem no catálogo", () => {
    const build = tweakSlot(baseBuild(), "fc", {
      becs: [
        { tensao_v: 9, corrente_a: 2 },
        { tensao_v: 5, corrente_a: 2 },
      ],
    });
    const plan = planPowerSupply(build, CONFIG);
    expect(plan.atribuicoes.find((a) => a.categoria === "camera_fpv")?.fonte).toMatchObject({
      tipo: "bec",
      indice: 1,
      tensao_v: 5,
    });
  });

  it("VTX que não cabe em nenhum BEC, mas aceita a bateria, vai direto na bateria", () => {
    // 3S vai de 9,9 V (quase vazia, sob carga) a 12,6 V (cheia): 9,5–26 V cobre a faixa toda.
    const build = tweakSlot(baseBuild(), "vtx", { tensao_v_min: 9.5 });
    const vtx = planPowerSupply(build, CONFIG).atribuicoes.find((a) => a.categoria === "vtx");
    expect(vtx?.fonte).toMatchObject({ tipo: "bateria" });
    expect(vtx?.fonte?.tensao_v).toBeCloseTo(11.1, 6);
  });

  it("peça que desligaria com a bateria quase vazia não pode ir direto na bateria", () => {
    // VTX a partir de 10 V: com a 3S a 9,9 V ele apagaria no fim do voo.
    const build = tweakSlot(baseBuild(), "vtx", { tensao_v_min: 10 });
    const vtx = planPowerSupply(build, CONFIG).atribuicoes.find((a) => a.categoria === "vtx");
    expect(vtx?.fonte).toBeNull();
  });

  it("corrente não publicada: usa o consumo presumido e avisa", () => {
    const build = tweakSlot(baseBuild(), "gps", { corrente_ma: undefined });
    const plan = planPowerSupply(build, CONFIG);
    expect(plan.presumidos).toEqual(["gps-teste"]);
    const gps = plan.atribuicoes.find((a) => a.categoria === "gps");
    expect(gps?.corrente_presumida).toBe(true);
    expect(gps?.corrente_a).toBeCloseTo(0.25, 6);
  });

  it("eletrônico sem tensão informada fica sem fonte e é listado como sem dado", () => {
    const build = tweakSlot(baseBuild(), "gps", { tensao_v: undefined });
    const plan = planPowerSupply(build, CONFIG);
    expect(plan.sem_dado).toEqual(["gps-teste"]);
    expect(plan.atribuicoes.find((a) => a.categoria === "gps")?.fonte).toBeNull();
  });

  it("tensão nominal depende da química da bateria", () => {
    const lihv = makeComponent({ categoria: "bateria", specs: { celulas: 4, quimica: "LiHV" } });
    const liion = makeComponent({ categoria: "bateria", specs: { celulas: 6, quimica: "Li-ion" } });
    if (lihv.categoria !== "bateria" || liion.categoria !== "bateria") throw new Error("categoria");
    expect(nominalBatteryVoltage(lihv, CONFIG)).toBeCloseTo(15.2, 6);
    expect(nominalBatteryVoltage(liion, CONFIG)).toBeCloseTo(21.6, 6);
  });
});

describe("autonomia", () => {
  const flightOf = (build = baseBuild(), tables: ThrustData[] = [THRUST_TABLE]) => {
    const propulsion = computePropulsion(build, tables, computeAuw(build, CONFIG));
    return computeFlightTime(build, propulsion, planPowerSupply(build, CONFIG), CONFIG);
  };

  it("devolve uma faixa (voo agitado a voo calmo)", () => {
    const f = flightOf();
    // 3 Ah × 70% / (10,28 A × 1,25 + 0,72 A) × 60 ≈ 9,3 min
    expect(f.min_minutos).toBeCloseTo(9.29, 1);
    // 3 Ah × 80% / (10,28 A + 0,72 A) × 60 ≈ 13,1 min
    expect(f.max_minutos).toBeCloseTo(13.09, 1);
    expect(f.premissas.length).toBeGreaterThanOrEqual(2);
  });

  it("autonomia é sempre estimativa, mesmo com tudo verificado", () => {
    const verified = { ...THRUST_TABLE, status_verificacao: "verificado" as const };
    expect(flightOf(withStatus(baseBuild(), "verificado"), [verified]).selo).toBe("estimativa");
  });

  it("sem corrente de pairar não há autonomia", () => {
    const f = flightOf(baseBuild(), []);
    expect(f.min_minutos).toBeUndefined();
    expect(f.selo).toBe("nao_verificado");
  });
});
