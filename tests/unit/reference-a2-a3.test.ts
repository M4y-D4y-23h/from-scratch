import { describe, expect, it } from "vitest";

import { DEFAULT_DRONE_CONFIG } from "@/domain/categories/drone/config";
import { buildProjectReport } from "@/domain/categories/drone/project";
import { solve, type TierPlan } from "@/domain/categories/drone/solver";
import { loadDroneCatalog } from "@/server/catalog/load";

/*
 * Aceite da Fase 1 para os Arquétipos 2 (FPV 5", Betaflight) e 3 (Tiny Whoop sub-250 g): com o
 * catálogo real, o solver gera as três faixas com relatório completo, e os números conferem com o
 * que os fabricantes publicam para drones prontos equivalentes.
 */

const { catalog } = loadDroneCatalog();
const config = DEFAULT_DRONE_CONFIG;

function archetypeOf(id: string) {
  const a = catalog.arquetipos.find((x) => x.id === id);
  if (!a) throw new Error(`arquétipo ${id} não está no catálogo`);
  return a;
}

const status = (plano: TierPlan, id: string) =>
  plano.validacao.resultados.find((r) => r.regra_id === id)?.status;

function blockingProblems(plano: TierPlan): string[] {
  return plano.validacao.resultados
    .filter((r) => r.severidade === "bloqueante" && r.status !== "passou")
    .map((r) => `${r.regra_id}: ${r.explicacao_tecnica}`);
}

describe('Arquétipo 2 (FPV 5"): builds de referência com o catálogo real', () => {
  const archetype = archetypeOf("a2-fpv-5pol");
  const result = solve({ archetype, catalog, config });

  it("gera as três faixas, sem regra bloqueante falhando nem sem dado", () => {
    expect(result.sem_solucao).toEqual([]);
    expect(result.faixas.map((f) => f.faixa)).toEqual(["economica", "equilibrada", "premium"]);
    for (const plano of result.faixas) {
      expect(blockingProblems(plano), plano.faixa).toEqual([]);
      expect(plano.validacao.incompleto).toBe(false);
    }
  });

  it("confere UARTs (receptor + controle do VTX), BEC, ESC, C-rating e failsafe do Betaflight", () => {
    for (const plano of result.faixas) {
      for (const id of [
        "uarts_suficientes",
        "bec_alimentacao",
        "esc_corrente",
        "bateria_c_rating",
        "furacao_stack_frame",
        "sistema_video",
        "antena_vtx",
        "monitor_bateria",
        "failsafe_configurado",
        "twr_alvo_arquetipo",
      ]) {
        expect(status(plano, id), `${plano.faixa}: ${id}`).toBe("passou");
      }
      // Sem GPS nem celular: regras do ArduPilot e da estação de solo não se aplicam.
      expect(status(plano, "failsafe_rtl")).toBeUndefined();
      expect(status(plano, "celular_estacao_de_solo")).toBeUndefined();
      expect(plano.build.opcoes.telemetria).toBe("nenhuma");
    }
  });

  it("câmera de 19 mm e stack de 20 x 20 mm (o frame só aceita 20 x 20)", () => {
    for (const plano of result.faixas) {
      const camera = plano.build.itens.find((i) => i.slot === "camera")?.componente;
      expect(camera?.categoria === "camera_fpv" && camera.specs.formato).toBe("micro_19mm");
      expect(plano.build.itens.find((i) => i.slot === "stack")?.componente.id).toBe(
        "iflight-blitz-mini-atf435-e55s",
      );
    }
  });

  it("números de voo de freestyle e coerentes com a iFlight", () => {
    for (const plano of result.faixas) {
      const { propulsion, flight, auw } = plano.metricas;
      expect(propulsion.twr).toBeGreaterThan(6);
      expect(propulsion.twr).toBeLessThan(14);
      // Paira abaixo da tabela (que começa em 50%): estimativa com a eficiência do 1º ponto.
      expect(propulsion.hover?.precisao).toBe("abaixo_da_tabela");
      // iFlight: Evoque F5 V3 de 736 g paira 12–13 min com 1480 mAh (bateria inteira). A conta usa
      // no máximo 80% da bateria de 1500 mAh, então o máximo fica perto de 80% desse tempo.
      expect(auw.massa_total_g).toBeGreaterThan(650);
      expect(auw.massa_total_g).toBeLessThan(800);
      expect(flight.max_minutos).toBeGreaterThan(0.8 * 12 * 0.85);
      expect(flight.max_minutos).toBeLessThan(0.8 * 13 * 1.15);
      // Freestyle agressivo: poucos minutos.
      expect(flight.min_minutos).toBeLessThan(4);
    }
  });

  it("projeto completo: passos, checkpoints, parâmetros e alertas", () => {
    const plano = result.faixas[0]!;
    const projeto = buildProjectReport(plano.build, archetype, catalog, config);
    expect(projeto.passos.length).toBeGreaterThanOrEqual(25);
    expect(projeto.passos.length).toBeLessThanOrEqual(45);
    expect(projeto.passos.filter((p) => p.checkpoint).map((p) => p.id)).toEqual(
      expect.arrayContaining([
        "teste-curto",
        "primeiro-power-on",
        "direcao-motores",
        "teste-failsafe-bancada",
        "instalar-helices",
        "primeiro-voo",
      ]),
    );
    const valor = (nome: string) => projeto.parametros.find((p) => p.nome === nome)?.valor;
    expect(valor("serialrx_provider")).toBe("CRSF");
    expect(valor("failsafe_procedure")).toBe("DROP");
    expect(valor("bat_capacity")).toBe(1500);
    expect(valor("osd_cap_alarm")).toBe(1200);
    // ESC BLHeli_S de fábrica: sem DShot bidirecional; LiPo comum: sem o ajuste de LiHV.
    expect(valor("dshot_bidir")).toBeUndefined();
    expect(valor("vbat_max_cell_voltage")).toBeUndefined();
    const ids = projeto.alertas.map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "lipo",
        "helices",
        "solda",
        "simulador",
        "regulamentacao",
        "acima-250g",
        "fpv-5pol-perigo",
        "vtx-anatel",
        "video-e-visada",
      ]),
    );
    expect(ids).not.toContain("ate-250g");
    expect(projeto.dificuldade.rotulo).toBe("Avançado");
  });

  it("custos: tudo com preço, exceto o rabicho XT60 (genérico) e o EPI sem preço pesquisado", () => {
    for (const plano of result.faixas) {
      expect(plano.custos.sem_preco.sort()).toEqual(
        [
          "Extintor de incêndio",
          "Genérico Rabicho XT60 macho com fio de silicone 12 AWG (≈ 10 cm)",
          "Kit de primeiros socorros",
          "Toalha grande",
        ].sort(),
      );
    }
    const [eco, , pre] = result.faixas;
    expect(pre!.custos.total_pecas.min_centavos).toBeGreaterThan(
      eco!.custos.total_pecas.min_centavos,
    );
  });
});

describe("Arquétipo 3 (Tiny Whoop): builds de referência com o catálogo real", () => {
  const archetype = archetypeOf("a3-tiny-whoop");
  const result = solve({ archetype, catalog, config });

  it("gera as três faixas, sem regra bloqueante falhando nem sem dado", () => {
    expect(result.sem_solucao).toEqual([]);
    expect(result.faixas.map((f) => f.faixa)).toEqual(["economica", "equilibrada", "premium"]);
    for (const plano of result.faixas) {
      expect(blockingProblems(plano), plano.faixa).toEqual([]);
      expect(plano.validacao.incompleto).toBe(false);
    }
  });

  it("fica abaixo de 250 g, com bateria que cabe no encaixe e hélice do tamanho do duto", () => {
    for (const plano of result.faixas) {
      for (const id of [
        "massa_limite_arquetipo",
        "bateria_cabe_no_frame",
        "helice_cabe_no_frame",
        "furacao_motor_frame",
        "sistema_video",
        "antena_vtx",
        "failsafe_configurado",
      ]) {
        expect(status(plano, id), `${plano.faixa}: ${id}`).toBe("passou");
      }
      expect(plano.metricas.auw.massa_total_g).toBeLessThan(50);
    }
  });

  it("frame de 65 mm na econômica e de 75 mm nas outras, cada um com o seu motor", () => {
    const motor = (p: TierPlan) => p.build.itens.find((i) => i.slot === "motores")?.componente.id;
    const [eco, equ, pre] = result.faixas;
    expect(motor(eco!)).toBe("betafpv-0702-2026-freestyle");
    expect(motor(equ!)).toBe("betafpv-0802-2026-freestyle");
    expect(motor(pre!)).toBe("betafpv-0802-2026-freestyle");
  });

  it("tempo de voo coerente com a BETAFPV (bateria inteira, voo calmo)", () => {
    // Air65 II Freestyle: 5:00 com 320 mAh; Air75 II Freestyle: 7:30 com 480 mAh. A conta usa no
    // máximo 80% da bateria, então o máximo fica perto de 80% desses tempos (±25%).
    const [eco, equ] = result.faixas;
    const max = (p: TierPlan) => p.metricas.flight.max_minutos ?? 0;
    expect(max(eco!)).toBeGreaterThan(0.8 * 5 * 0.75);
    expect(max(eco!)).toBeLessThan(0.8 * 5 * 1.25);
    expect(max(equ!)).toBeGreaterThan(0.8 * 7.5 * 0.75);
    expect(max(equ!)).toBeLessThan(0.8 * 7.5 * 1.25);
  });

  it("projeto completo: sem solda, parâmetros de LiHV e alertas de até 250 g", () => {
    const plano = result.faixas[1]!;
    const projeto = buildProjectReport(plano.build, archetype, catalog, config);
    expect(projeto.passos.length).toBeGreaterThanOrEqual(25);
    expect(projeto.passos.length).toBeLessThanOrEqual(45);
    expect(projeto.passos.some((p) => p.ferramentas.includes("ferro-de-solda"))).toBe(false);
    const valor = (nome: string) => projeto.parametros.find((p) => p.nome === nome)?.valor;
    expect(valor("vbat_max_cell_voltage")).toBe(440);
    expect(valor("dshot_bidir")).toBe("ON");
    expect(valor("bat_capacity")).toBe(480);
    expect(projeto.parametros_pendentes).toEqual([]);
    const ids = projeto.alertas.map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining(["ate-250g", "whoop-em-casa", "lihv", "vtx-sem-antena", "lipo"]),
    );
    expect(ids).not.toContain("acima-250g");
    expect(ids).not.toContain("solda");
    // A mais fácil dos três arquétipos: sem solda, nível máximo 2.
    expect(projeto.dificuldade.nota).toBeLessThan(2);
    const locais = projeto.locais.map((l) => l.local);
    expect(locais).toEqual(expect.arrayContaining(["comprar_pronto", "em_casa"]));
  });
});
