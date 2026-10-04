import { describe, expect, it } from "vitest";

import type { RuleResult, ValidationReport } from "@/domain/core/validation";

import {
  baseBuild,
  ctxFor,
  item,
  makeComponent,
  parts,
  removeSlot,
  replaceSlot,
  TEST_ARCHETYPE,
  tweak,
  tweakSlot,
} from "./__fixtures__/builds";
import type { Build } from "./build";
import { computeFlightTime, computePropulsion, computeAuw, planPowerSupply } from "./calculations";
import { checkCatalog, type DroneCatalog } from "./catalog";
import { requiredUarts, validateBuild, type ValidationContext } from "./compatibility";
import { DEFAULT_DRONE_CONFIG } from "./config";
import { solve } from "./solver";

/*
 * Regras e cálculos que entraram com os arquétipos de FPV 5" (Betaflight) e Tiny Whoop:
 * VTX embutido na AIO, UART do controle do VTX, encaixe da bateria, BEC não publicado,
 * estilo de voo na autonomia e peças que só vêm na caixa de outra.
 */

function run(build: Build, over: Partial<ValidationContext> = {}): ValidationReport {
  return validateBuild(ctxFor(build, over)).report;
}

function rule(report: ValidationReport, id: string): RuleResult {
  const found = report.resultados.find((r) => r.regra_id === id);
  if (!found) throw new Error(`regra ${id} não rodou`);
  return found;
}

const betaflight = { ...TEST_ARCHETYPE, firmware: "Betaflight" as const };

/** AIO de whoop "5 em 1": FC + ESC + receptor + VTX, com antena na caixa. */
function aio() {
  return makeComponent({
    id: "aio-teste",
    categoria: "fc_aio",
    massa_g: 4,
    inclui: [{ componente_id: "antena-aio-teste", quantidade: 1 }],
    specs: {
      fc: {
        firmwares: [{ nome: "Betaflight", alvo: "TESTEG473", lista_oficial: true }],
        uarts: [{ nome: "UART1" }],
        saidas_motor: 4,
        becs: [{ tensao_v: 5, corrente_a: 3 }],
        sensor_tensao: true,
        osd_analogico: true,
      },
      esc: { corrente_continua_a: 12, celulas_min: 1, celulas_max: 1 },
      receptor: { link: "elrs_2g4", saidas: ["CRSF"], esp: true },
      vtx: { sistema: "analogico_5g8", controle: "SmartAudio" },
    },
  });
}

function aioAntenna() {
  return makeComponent({
    id: "antena-aio-teste",
    categoria: "antena",
    massa_g: 0.5,
    vendido_separadamente: false,
    preco_estimado_brl: undefined,
    specs: { frequencia_ghz: 5.8 },
  });
}

function goggles() {
  return makeComponent({
    categoria: "oculos_fpv",
    massa_g: 400,
    specs: { sistema: "analogico_5g8", receptor_analogico: true },
  });
}

/** Build com AIO: troca FC/ESC/receptor/VTX avulsos pela AIO e o receptor USB por óculos. */
function aioBuild(): Build {
  let b = baseBuild();
  for (const slot of ["fc", "escs", "receptor", "vtx", "antena_video", "receptor_video", "gps"]) {
    b = removeSlot(b, slot);
  }
  return {
    ...b,
    opcoes: { ...b.opcoes, telemetria: "nenhuma" },
    itens: [
      ...b.itens.filter((i) => i.slot !== "telemetria" && i.slot !== "mastro"),
      item("fc", aio()),
      { ...item("antena_video", aioAntenna()), fornecido_por: "aio-teste" },
      item("oculos", goggles()),
    ],
  };
}

describe("AIO com VTX embutido (whoop)", () => {
  it("câmera + VTX da AIO + óculos do mesmo sistema passam", () => {
    const report = run(aioBuild(), { archetype: betaflight, firmwareProfile: undefined });
    expect(rule(report, "sistema_video").status).toBe("passou");
  });

  it("a antena que vem na caixa da AIO passa, mesmo sem o conector informado", () => {
    const report = run(aioBuild(), { archetype: betaflight, firmwareProfile: undefined });
    const r = rule(report, "antena_vtx");
    expect(r.status).toBe("passou");
    expect(r.explicacao_tecnica).toContain("Antena original");
  });

  it("sistema diferente no VTX da AIO falha", () => {
    const build = tweakSlot(aioBuild(), "fc", {
      vtx: { sistema: "walksnail", controle: "MSP" },
    });
    const report = run(build, { archetype: betaflight, firmwareProfile: undefined });
    expect(rule(report, "sistema_video").status).toBe("falhou");
  });
});

describe("UART do controle do VTX", () => {
  it("VTX analógico numa FC com OSD (Betaflight) ocupa uma UART", () => {
    const build = tweakSlot(tweakSlot(baseBuild(), "fc", { osd_analogico: true }), "vtx", {
      controle: "SmartAudio",
    });
    expect(requiredUarts(build).usos).toContain("controle do VTX (SmartAudio)");
  });

  it("VTX analógico numa FC sem OSD (Pixhawk) não ocupa UART", () => {
    const build = tweakSlot(baseBuild(), "vtx", { controle: "SmartAudio" });
    expect(requiredUarts(build).usos.some((u) => u.includes("VTX"))).toBe(false);
  });

  it("VTX digital (MSP) sempre ocupa uma UART", () => {
    const build = tweakSlot(baseBuild(), "vtx", { sistema: "walksnail", controle: "MSP" });
    expect(requiredUarts(build).usos).toContain("controle do VTX (MSP)");
  });

  it("sem UART livre para o VTX, a regra falha", () => {
    const build = tweakSlot(
      tweakSlot(baseBuild(), "fc", {
        osd_analogico: true,
        uarts: [{ nome: "UART1" }, { nome: "UART2" }, { nome: "UART3" }],
      }),
      "vtx",
      { controle: "SmartAudio" },
    );
    // Receptor + GPS + telemetria Wi-Fi + VTX = 4 UARTs; a FC tem 3.
    expect(rule(run(build), "uarts_suficientes").status).toBe("falhou");
  });
});

describe("bateria no encaixe do frame (whoop)", () => {
  const slot = { slot_bateria_mm: { largura: 11.4, altura: 6.2 } };
  const withBattery = (dims: { comprimento: number; largura: number; altura: number }) =>
    tweakSlot(tweakSlot(baseBuild(), "frame", slot), "bateria", {}, { dimensoes_mm: dims });

  it("bateria de 64 × 10 × 6 mm entra no encaixe de 11,4 × 6,2 mm", () => {
    const report = run(withBattery({ comprimento: 64, largura: 10, altura: 6 }));
    expect(rule(report, "bateria_cabe_no_frame").status).toBe("passou");
  });

  it("bateria de 61 × 15,5 × 6 mm não entra", () => {
    const report = run(withBattery({ comprimento: 61, largura: 15.5, altura: 6 }));
    expect(rule(report, "bateria_cabe_no_frame").status).toBe("falhou");
  });

  it("sem as dimensões da bateria, fica sem dado; frame sem encaixe não roda a regra", () => {
    const semDim = run(tweakSlot(baseBuild(), "frame", slot));
    expect(rule(semDim, "bateria_cabe_no_frame").status).toBe("sem_dado");
    expect(run(baseBuild()).resultados.some((r) => r.regra_id === "bateria_cabe_no_frame")).toBe(
      false,
    );
  });
});

describe("BEC não publicado pelo fabricante", () => {
  it("vira 'sem dado', não falha", () => {
    const fc = tweak(parts.fc());
    const semBec = replaceSlot(
      baseBuild(),
      "fc",
      makeComponent({ ...fc, specs: { ...fc.specs, becs: undefined } }),
    );
    expect(planPowerSupply(semBec, DEFAULT_DRONE_CONFIG).sem_dado).toContain("receptor-teste");
    expect(rule(run(semBec), "bec_alimentacao").status).toBe("sem_dado");
  });
});

describe("autonomia por estilo de voo", () => {
  const build = baseBuild();
  const cfg = DEFAULT_DRONE_CONFIG;
  const auw = computeAuw(build, cfg);
  const prop = computePropulsion(build, ctxFor(build).thrustTables, auw);
  const power = planPowerSupply(build, cfg);

  it("freestyle tem a mesma autonomia máxima e mínima menor que o voo estável", () => {
    const estavel = computeFlightTime(build, prop, power, cfg, "estavel");
    const freestyle = computeFlightTime(build, prop, power, cfg, "freestyle");
    expect(freestyle.max_minutos).toBeCloseTo(estavel.max_minutos ?? 0, 9);
    expect(freestyle.min_minutos).toBeLessThan(estavel.min_minutos ?? 0);
    expect(freestyle.premissas.join(" ")).toContain("acrobacias");
  });
});

describe("solver: peça que só vem na caixa de outra", () => {
  it("não monta um build com a antena da AIO sem a AIO", () => {
    const vtxAntenna = makeComponent({
      id: "antena-vtx-teste",
      categoria: "antena",
      massa_g: 2,
      vendido_separadamente: false,
      preco_estimado_brl: undefined,
      specs: { frequencia_ghz: 5.8, conector: "MMCX" },
    });
    const vtx = tweak(
      parts.vtx(),
      {},
      { inclui: [{ componente_id: "antena-vtx-teste", quantidade: 1 }] },
    );
    const catalog: DroneCatalog = {
      componentes: [vtx, vtxAntenna, aioAntenna(), aio()],
      empuxo: [],
      ferramentas: [],
      arquetipos: [],
      perfis_firmware: [],
    };
    const archetype = {
      ...TEST_ARCHETYPE,
      slots: [
        { slot: "vtx", categorias: ["vtx"], quantidade: 1, obrigatorio: true, coberto_por: [] },
        {
          slot: "antena",
          categorias: ["antena"],
          quantidade: 1,
          obrigatorio: true,
          coberto_por: [],
        },
      ],
    };
    const result = solve({ archetype, catalog, config: DEFAULT_DRONE_CONFIG });
    for (const plano of result.faixas) {
      const antena = plano.build.itens.find((i) => i.slot === "antena");
      expect(antena?.componente.id).toBe("antena-vtx-teste");
      expect(antena?.fornecido_por).toBe(vtx.id);
    }
  });
});

describe("catálogo", () => {
  const base: DroneCatalog = {
    componentes: [],
    empuxo: [],
    ferramentas: [],
    arquetipos: [],
    perfis_firmware: [],
  };

  it("item genérico (conector) pode ficar sem preço; peça comum não", () => {
    const conector = makeComponent({
      categoria: "conector",
      preco_estimado_brl: undefined,
      specs: { tipo: "XT60" },
    });
    const motor = tweak(parts.motor(), {}, { preco_estimado_brl: undefined });
    const problemas = checkCatalog({ ...base, componentes: [conector, motor] });
    expect(problemas).toEqual([`componente ${motor.id}: sem preço (em R$ ou em US$)`]);
  });

  it("ferramenta que cita um arquétipo inexistente é apontada", () => {
    const problemas = checkCatalog({
      ...base,
      ferramentas: [
        {
          id: "chave-teste",
          nome: "Chave",
          tipo: "ferramenta",
          prioridade: "essencial",
          para_que_serve: "teste",
          por_que_necessaria: "teste",
          cuidados: [],
          onde_comprar: [{ tipo_loja: "loja_ferramentas", termo_busca: "chave" }],
          arquetipos: ["nao-existe"],
          fontes: [],
        },
      ],
    });
    expect(problemas).toContain('ferramenta chave-teste: arquétipo "nao-existe" não existe');
  });
});
