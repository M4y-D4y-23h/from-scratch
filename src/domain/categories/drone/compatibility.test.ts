import { describe, expect, it } from "vitest";

import type { RuleResult, ValidationReport } from "@/domain/core/validation";

import {
  baseBuild,
  ctxFor,
  item,
  makeComponent,
  removeSlot,
  TEST_ARCHETYPE,
  TEST_FIRMWARE,
  THRUST_TABLE,
  tweakSlot,
  withStatus,
} from "./__fixtures__/builds";
import type { Build } from "./build";
import { requiredUarts, validateBuild, type ValidationContext } from "./compatibility";

function run(build: Build, over: Partial<ValidationContext> = {}): ValidationReport {
  return validateBuild(ctxFor(build, over)).report;
}

function rule(report: ValidationReport, id: string): RuleResult {
  const found = report.resultados.find((r) => r.regra_id === id);
  if (!found) throw new Error(`regra ${id} não rodou`);
  return found;
}

const ids = (report: ValidationReport) => report.resultados.map((r) => r.regra_id);

/** Espera que a regra falhe e que o projeto fique bloqueado (ou não, se for alerta). */
function expectFailure(report: ValidationReport, id: string): RuleResult {
  const r = rule(report, id);
  expect(r.status, r.explicacao_tecnica).toBe("falhou");
  expect(r.sugestao, "falha sempre traz sugestão").toBeTruthy();
  expect(report.bloqueado).toBe(r.severidade === "bloqueante");
  return r;
}

describe("build de referência", () => {
  it("passa em todas as regras", () => {
    const report = run(baseBuild());
    const problemas = report.resultados.filter((r) => r.status !== "passou");
    expect(problemas.map((r) => `${r.regra_id}: ${r.explicacao_tecnica}`)).toEqual([]);
    expect(report.bloqueado).toBe(false);
    expect(report.incompleto).toBe(false);
  });

  it("roda as regras de encaixe, energia, voo, eletrônica e failsafe do Arquétipo 1", () => {
    expect(ids(run(baseBuild()))).toEqual(
      expect.arrayContaining([
        "helice_cabe_no_frame",
        "furacao_motor_frame",
        "furacao_stack_frame",
        "helice_encaixa_no_motor",
        "celulas_motor",
        "celulas_esc",
        "celulas_fc",
        "conector_bateria",
        "esc_corrente",
        "bateria_c_rating",
        "paira",
        "twr_minimo",
        "twr_alvo_arquetipo",
        "hover_throttle",
        "fc_firmware_oficial",
        "fc_memoria_ardupilot",
        "saidas_motor",
        "uarts_suficientes",
        "radio_receptor_mesmo_link",
        "receptor_saida_serial",
        "bec_alimentacao",
        "monitor_bateria",
        "sistema_video",
        "antena_vtx",
        "gps_com_bussola",
        "bussola_longe_da_potencia",
        "failsafe_rtl",
        "helice_segura_iniciante",
        "celular_estacao_de_solo",
      ]),
    );
  });

  it("toda regra explica em linguagem leiga e cita fonte", () => {
    for (const r of run(baseBuild()).resultados) {
      expect(r.explicacao_leiga.length, r.regra_id).toBeGreaterThan(20);
      expect(r.fontes?.length, r.regra_id).toBeGreaterThan(0);
    }
  });
});

describe("casos que devem falhar (aceite da Fase 1)", () => {
  it("TWR baixo", () => {
    // Bateria de 900 g: peso ≈ 1758 g para 3400 g de empuxo → TWR ≈ 1,93.
    const report = run(tweakSlot(baseBuild(), "bateria", {}, { massa_g: 900 }));
    const r = expectFailure(report, "twr_minimo");
    expect(r.valores?.twr).toBeCloseTo(3400 / 1758.24, 6);
  });

  it("ESC subdimensionado", () => {
    const report = run(tweakSlot(baseBuild(), "escs", { corrente_continua_a: 10 }));
    const r = expectFailure(report, "esc_corrente");
    // 11 A do motor × 1,2 de margem.
    expect(r.valores?.necessario_a).toBeCloseTo(13.2, 6);
  });

  it("furação do motor incompatível com o braço", () => {
    const report = run(tweakSlot(baseBuild(), "motores", { furacao: ["12x12 M2"] }));
    expectFailure(report, "furacao_motor_frame");
  });

  it("hélice grande demais para o frame", () => {
    const report = run(tweakSlot(baseBuild(), "frame", { helice_max_pol: 8 }));
    expectFailure(report, "helice_cabe_no_frame");
  });

  it("C-rating da bateria insuficiente", () => {
    // 3 Ah × 10C = 30 A; o drone pede ≈ 44,7 A × 1,2.
    const report = run(tweakSlot(baseBuild(), "bateria", { c_continuo: 10 }));
    const r = expectFailure(report, "bateria_c_rating");
    expect(r.valores?.capacidade_a).toBeCloseTo(30, 6);
  });

  it("FC sem UARTs suficientes para rádio + GPS + telemetria", () => {
    const report = run(
      tweakSlot(baseBuild(), "fc", { uarts: [{ nome: "SERIAL1" }, { nome: "SERIAL2" }] }),
    );
    const r = expectFailure(report, "uarts_suficientes");
    expect(r.valores).toMatchObject({ necessarias: 3, disponiveis: 2 });
    // A sugestão aponta a alternativa: telemetria pela mesma porta do rádio.
    expect(r.sugestao).toContain("MAVLink");
  });
});

describe("telemetria pelo ELRS (modo MAVLink)", () => {
  const mavlinkBuild = () => {
    const build = removeSlot(baseBuild(), "telemetria");
    return { ...build, opcoes: { ...build.opcoes, telemetria: "elrs_mavlink" as const } };
  };

  it("rádio e GPS cabem em 2 UARTs (o receptor leva controle e telemetria)", () => {
    const build = tweakSlot(mavlinkBuild(), "fc", {
      uarts: [{ nome: "SERIAL1" }, { nome: "SERIAL2" }],
    });
    expect(requiredUarts(build).total).toBe(2);
    const report = run(build);
    expect(rule(report, "uarts_suficientes").status).toBe("passou");
    expect(rule(report, "elrs_mavlink_requisitos").status).toBe("passou");
    expect(rule(report, "receptor_saida_serial").titulo).toContain("MAVLink");
    expect(report.bloqueado).toBe(false);
  });

  it("rádio sem backpack Wi-Fi não manda telemetria para o celular", () => {
    const report = run(tweakSlot(mavlinkBuild(), "radio", { backpack_wifi: false }));
    expectFailure(report, "elrs_mavlink_requisitos");
  });

  it("receptor sem saída MAVLink não serve", () => {
    const report = run(tweakSlot(mavlinkBuild(), "receptor", { saidas: ["CRSF"] }));
    expectFailure(report, "receptor_saida_serial");
  });

  it("no modo Wi-Fi a telemetria ocupa uma UART a mais", () => {
    expect(requiredUarts(baseBuild())).toMatchObject({ total: 3 });
  });
});

describe("encaixe e energia", () => {
  it("motores fracos demais: o drone não sai do chão", () => {
    const report = run(tweakSlot(baseBuild(), "bateria", {}, { massa_g: 3000 }));
    expectFailure(report, "paira");
  });

  it("bateria com células demais para motor e ESC", () => {
    const report = run(tweakSlot(baseBuild(), "bateria", { celulas: 6 }));
    expectFailure(report, "celulas_motor");
    expect(rule(report, "celulas_esc").status).toBe("falhou");
    expect(rule(report, "celulas_fc").status).toBe("passou");
  });

  it("conector da bateria diferente do drone", () => {
    expectFailure(run(tweakSlot(baseBuild(), "bateria", { conector: "XT30" })), "conector_bateria");
  });

  it("hélice com fixação que o motor não tem", () => {
    const report = run(tweakSlot(baseBuild(), "helices", { fixacao: "t_mount" }));
    expectFailure(report, "helice_encaixa_no_motor");
  });

  it("FC com furação diferente do frame", () => {
    const report = run(tweakSlot(baseBuild(), "fc", { furacao: ["20x20 M3"] }));
    expectFailure(report, "furacao_stack_frame");
  });
});

describe("furação por eixo e fixação da FC", () => {
  it("braço com 16x16 e 19x19 aceita motor 16x19 (como o kit X500 V2)", () => {
    const build = tweakSlot(baseBuild(), "frame", { furacao_motor: ["16x16 M3", "19x19 M3"] });
    expect(rule(run(build), "furacao_motor_frame").status).toBe("passou");
  });

  it("braço só 16x19 não aceita motor 16x16 (só 2 furos coincidem)", () => {
    const build = tweakSlot(baseBuild(), "motores", { furacao: ["16x16 M3"] });
    expect(rule(run(build), "furacao_motor_frame").status).toBe("falhou");
  });

  it("rosca diferente não encaixa, mesmo com a mesma medida", () => {
    const build = tweakSlot(baseBuild(), "motores", { furacao: ["16x19 M2"] });
    expect(rule(run(build), "furacao_motor_frame").status).toBe("falhou");
  });

  it("FC padrão Pixhawk vai presa com espuma na placa do frame, sem furação", () => {
    const build = tweakSlot(
      tweakSlot(baseBuild(), "frame", { furacao_stack: [], fixacao_fc_fita: true }),
      "fc",
      { furacao: [], fixacao_fita: true },
    );
    expect(rule(run(build), "furacao_stack_frame").status).toBe("passou");
  });
});

describe("energia: conector da PDB, monitor de bateria e módulo de energia", () => {
  it("o conector da PDB do frame conta como entrada de energia", () => {
    const build = tweakSlot(removeSlot(baseBuild(), "conector"), "frame", {
      conector_bateria: "XT60",
    });
    expect(rule(run(build), "conector_bateria").status).toBe("passou");
  });

  it("PDB sem sensor não anula o sensor de tensão da FC", () => {
    const pdb = makeComponent({
      categoria: "modulo_energia",
      massa_g: 10,
      specs: { mede_tensao: false, mede_corrente: false, pdb: true },
    });
    const build = { ...baseBuild(), itens: [...baseBuild().itens, item("pdb", pdb)] };
    expect(rule(run(build), "monitor_bateria").status).toBe("passou");
  });

  it("módulo de energia abaixo do pico de corrente gera alerta (não bloqueia)", () => {
    const pm = makeComponent({
      categoria: "modulo_energia",
      massa_g: 20,
      specs: { mede_tensao: true, mede_corrente: true, corrente_continua_a: 30, conector: "XT60" },
    });
    const build = { ...baseBuild(), itens: [...baseBuild().itens, item("pm", pm)] };
    // Pico dos motores: 4 × 11 A = 44 A > 30 A contínuos.
    const r = expectFailure(run(build), "modulo_energia_corrente");
    expect(r.severidade).toBe("alerta");
  });
});

describe("controladora, rádio e vídeo", () => {
  it("FC fora da lista oficial do ArduPilot", () => {
    const report = run(
      tweakSlot(baseBuild(), "fc", {
        firmwares: [{ nome: "ArduPilot", alvo: "Clone", lista_oficial: false }],
      }),
    );
    expectFailure(report, "fc_firmware_oficial");
  });

  it("FC de 1 MB não roda o ArduPilot completo", () => {
    expectFailure(run(tweakSlot(baseBuild(), "fc", { flash_mb: 1 })), "fc_memoria_ardupilot");
  });

  it("FC com menos saídas que motores", () => {
    expectFailure(run(tweakSlot(baseBuild(), "fc", { saidas_motor: 3 })), "saidas_motor");
  });

  it("placa F4 sem DMA na UART do receptor gera alerta (não bloqueia)", () => {
    const report = run(
      tweakSlot(baseBuild(), "fc", {
        mcu: "STM32F405",
        uarts: [1, 2, 3].map((n) => ({ nome: `SERIAL${n}`, dma_rx: false })),
      }),
    );
    const r = expectFailure(report, "uart_rc_dma");
    expect(r.severidade).toBe("alerta");
  });

  it("rádio e receptor de sistemas diferentes", () => {
    const report = run(tweakSlot(baseBuild(), "radio", { link: "crossfire" }));
    expectFailure(report, "radio_receptor_mesmo_link");
  });

  it("BEC sobrecarregado pelo VTX", () => {
    // 1,8 A no BEC de 9 V / 2 A: passa dos 80% recomendados.
    const report = run(tweakSlot(baseBuild(), "vtx", { corrente_ma_max: 1800 }));
    expectFailure(report, "bec_alimentacao");
  });

  it("eletrônico sem nenhuma fonte de tensão compatível", () => {
    // VTX só de 12 V: nem os BECs (5 V, 9 V) nem a bateria 3S (11,1 V) servem.
    const report = run(tweakSlot(baseBuild(), "vtx", { tensao_v_min: 12, tensao_v_max: 12 }));
    const r = expectFailure(report, "bec_alimentacao");
    expect(r.explicacao_tecnica).toContain("Sem fonte compatível");
  });

  it("drone que não mede a bateria não tem failsafe de bateria", () => {
    expectFailure(run(tweakSlot(baseBuild(), "fc", { sensor_tensao: false })), "monitor_bateria");
  });

  it("câmera digital com VTX analógico", () => {
    expectFailure(run(tweakSlot(baseBuild(), "camera", { sistema: "dji_o4" })), "sistema_video");
  });

  it("antena com conector diferente do VTX", () => {
    const report = run(tweakSlot(baseBuild(), "antena_video", { conector: "U.FL" }));
    expectFailure(report, "antena_vtx");
  });
});

describe("GPS, bússola e failsafe", () => {
  it("GPS sem bússola não permite o retorno automático", () => {
    expectFailure(run(tweakSlot(baseBuild(), "gps", { bussola: null })), "gps_com_bussola");
  });

  it("sem GPS o Arquétipo 1 é bloqueado", () => {
    const report = run(removeSlot(removeSlot(baseBuild(), "gps"), "mastro"));
    expectFailure(report, "gps_com_bussola");
    expect(ids(report)).not.toContain("bussola_longe_da_potencia");
  });

  it("sem mastro a bússola fica perto dos fios de potência", () => {
    expectFailure(run(removeSlot(baseBuild(), "mastro")), "bussola_longe_da_potencia");
  });

  it("mastro curto demais", () => {
    const report = run(tweakSlot(baseBuild(), "mastro", { altura_mm: 60 }));
    expectFailure(report, "bussola_longe_da_potencia");
  });

  it("perfil sem failsafe de rádio", () => {
    const profile = {
      ...TEST_FIRMWARE,
      parametros: TEST_FIRMWARE.parametros.filter((p) => p.nome !== "FS_THR_ENABLE"),
    };
    const r = expectFailure(run(baseBuild(), { firmwareProfile: profile }), "failsafe_rtl");
    expect(r.explicacao_tecnica).toContain("FS_THR_ENABLE");
  });

  it("failsafe de bateria com ação diferente de RTL", () => {
    const profile = {
      ...TEST_FIRMWARE,
      parametros: TEST_FIRMWARE.parametros.map((p) =>
        p.nome === "BATT_FS_LOW_ACT" ? { ...p, valor: 0 } : p,
      ),
    };
    expectFailure(run(baseBuild(), { firmwareProfile: profile }), "failsafe_rtl");
  });

  it("sem perfil de firmware o app não afirma que o failsafe está configurado", () => {
    const report = run(baseBuild(), { firmwareProfile: undefined });
    expect(rule(report, "failsafe_rtl").status).toBe("sem_dado");
    expect(report.incompleto).toBe(true);
  });
});

describe("alertas (não bloqueiam)", () => {
  it("pairar acima de 60% do acelerador", () => {
    const report = run(tweakSlot(baseBuild(), "bateria", {}, { massa_g: 900 }));
    expect(rule(report, "hover_throttle")).toMatchObject({
      status: "falhou",
      severidade: "alerta",
    });
  });

  it("TWR acima da faixa do arquétipo", () => {
    const archetype = {
      ...TEST_ARCHETYPE,
      faixas: { ...TEST_ARCHETYPE.faixas, twr_alvo: [2, 3] as [number, number] },
    };
    const report = run(baseBuild(), { archetype });
    expectFailure(report, "twr_alvo_arquetipo");
  });

  it("hélice de fibra de carbono para iniciante", () => {
    const report = run(tweakSlot(baseBuild(), "helices", { material: "fibra_de_carbono" }));
    expectFailure(report, "helice_segura_iniciante");
  });

  it("iPhone não roda o QGroundControl oficial", () => {
    const build = baseBuild();
    const report = run({ ...build, opcoes: { ...build.opcoes, celular: "ios" } });
    expectFailure(report, "celular_estacao_de_solo");
  });

  it("celular desconhecido: pergunta antes de prometer", () => {
    const build = baseBuild();
    const report = run({ ...build, opcoes: { ...build.opcoes, celular: "desconhecido" } });
    expect(rule(report, "celular_estacao_de_solo").status).toBe("sem_dado");
    expect(report.incompleto).toBe(false);
  });

  it("controle só pelo celular é experimental", () => {
    const build = baseBuild();
    const report = run({
      ...build,
      opcoes: { ...build.opcoes, controle: "celular_experimental" },
    });
    expectFailure(report, "controle_so_pelo_celular");
  });
});

describe("limite de peso do arquétipo", () => {
  it("passar do limite prometido bloqueia", () => {
    const report = run(baseBuild(), { archetype: { ...TEST_ARCHETYPE, massa_max_g: 250 } });
    expectFailure(report, "massa_limite_arquetipo");
  });
});

describe("sem dado nunca vira 'passou'", () => {
  it("peça sem massa: TWR e 'paira' ficam sem dado e o relatório fica incompleto", () => {
    const report = run(tweakSlot(baseBuild(), "motores", {}, { massa_g: undefined }));
    expect(rule(report, "paira").status).toBe("sem_dado");
    expect(rule(report, "twr_minimo").status).toBe("sem_dado");
    expect(ids(report)).not.toContain("twr_alvo_arquetipo");
    expect(report.bloqueado).toBe(false);
    expect(report.incompleto).toBe(true);
  });

  it("sem tabela de empuxo: correntes e empuxo ficam sem dado", () => {
    const report = run(baseBuild(), { thrustTables: [] });
    for (const id of ["paira", "twr_minimo", "esc_corrente", "bateria_c_rating"]) {
      expect(rule(report, id).status, id).toBe("sem_dado");
    }
    expect(report.incompleto).toBe(true);
  });

  it("consumo não informado e sem hipótese possível (VTX): alimentação sem dado", () => {
    const report = run(tweakSlot(baseBuild(), "vtx", { corrente_ma_max: undefined }));
    expect(rule(report, "bec_alimentacao").status).toBe("sem_dado");
    expect(report.incompleto).toBe(true);
  });

  it("consumo presumido aparece na explicação e limita o selo a ⚠️", () => {
    const build = tweakSlot(withStatus(baseBuild(), "verificado"), "gps", {
      corrente_ma: undefined,
    });
    const r = rule(run(build), "bec_alimentacao");
    expect(r.status).toBe("passou");
    expect(r.explicacao_tecnica).toContain("hipótese");
    expect(r.selo).toBe("estimativa");
  });

  it("VTX sem antena na lista: sem dado (pode vir na caixa, mas é preciso conferir)", () => {
    const report = run(removeSlot(baseBuild(), "antena_video"));
    expect(rule(report, "antena_vtx").status).toBe("sem_dado");
  });
});

describe("selos dos resultados", () => {
  const verifiedTable = { ...THRUST_TABLE, status_verificacao: "verificado" as const };

  it("comparação entre peças verificadas é ✅; cálculo nunca passa de ⚠️", () => {
    const report = run(withStatus(baseBuild(), "verificado"), { thrustTables: [verifiedTable] });
    expect(rule(report, "furacao_motor_frame").selo).toBe("verificado");
    expect(rule(report, "twr_minimo").selo).toBe("estimativa");
    expect(rule(report, "esc_corrente").selo).toBe("estimativa");
  });

  it("uma peça não verificada contamina só as regras em que ela entra", () => {
    const build = tweakSlot(
      withStatus(baseBuild(), "verificado"),
      "motores",
      {},
      { status_verificacao: "nao_verificado" },
    );
    const report = run(build, { thrustTables: [verifiedTable] });
    expect(rule(report, "furacao_motor_frame").selo).toBe("nao_verificado");
    expect(rule(report, "twr_minimo").selo).toBe("nao_verificado");
    expect(rule(report, "furacao_stack_frame").selo).toBe("verificado");
  });
});

describe("firmware do arquétipo", () => {
  it("regras do ArduPilot não se aplicam a um arquétipo Betaflight", () => {
    const report = run(baseBuild(), {
      archetype: { ...TEST_ARCHETYPE, firmware: "Betaflight" },
      firmwareProfile: undefined,
    });
    for (const id of [
      "fc_memoria_ardupilot",
      "gps_com_bussola",
      "bussola_longe_da_potencia",
      "failsafe_rtl",
      "monitor_bateria",
    ]) {
      expect(ids(report), id).not.toContain(id);
    }
    // A FC de teste só declara ArduPilot.
    expect(rule(report, "fc_firmware_oficial").status).toBe("falhou");
  });
});
