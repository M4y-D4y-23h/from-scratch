import { describe, expect, it } from "vitest";

import { DEFAULT_DRONE_CONFIG } from "@/domain/categories/drone/config";
import { computeDifficulty } from "@/domain/categories/drone/difficulty";
import { buildProjectReport } from "@/domain/categories/drone/project";
import { compareSizeClasses } from "@/domain/categories/drone/size-comparison";
import { solve } from "@/domain/categories/drone/solver";
import { loadDroneCatalog } from "@/server/catalog/load";

/*
 * Aceite da Fase 1 para o Arquétipo 1: com o catálogo real (data/catalog/drone), o solver gera as
 * três faixas com relatório completo, e as regras exigidas pela SPEC passam: UARTs (rádio + GPS +
 * telemetria), alimentação do vídeo e failsafe → RTL.
 */

const { catalog } = loadDroneCatalog();
const archetype = catalog.arquetipos.find((a) => a.id === "a1-gps-filmagem");
if (!archetype) throw new Error("arquétipo a1-gps-filmagem não está no catálogo");
const result = solve({ archetype, catalog, config: DEFAULT_DRONE_CONFIG });

describe("Arquétipo 1: builds de referência com o catálogo real", () => {
  it("gera as três faixas", () => {
    expect(result.sem_solucao).toEqual([]);
    expect(result.faixas.map((f) => f.faixa)).toEqual(["economica", "equilibrada", "premium"]);
  });

  it.each(["economica", "equilibrada", "premium"] as const)(
    "%s: nenhuma regra bloqueante falha e nenhuma fica sem dado",
    (faixa) => {
      const plano = result.faixas.find((f) => f.faixa === faixa);
      expect(plano).toBeDefined();
      const problemas = plano!.validacao.resultados
        .filter((r) => r.severidade === "bloqueante" && r.status !== "passou")
        .map((r) => `${r.regra_id}: ${r.explicacao_tecnica}`);
      expect(problemas).toEqual([]);
      expect(plano!.validacao.bloqueado).toBe(false);
      expect(plano!.validacao.incompleto).toBe(false);
    },
  );

  it("valida UARTs, alimentação do vídeo, failsafe → RTL e bússola em todas as faixas", () => {
    for (const plano of result.faixas) {
      const status = (id: string) =>
        plano.validacao.resultados.find((r) => r.regra_id === id)?.status;
      for (const id of [
        "uarts_suficientes",
        "bec_alimentacao",
        "sistema_video",
        "antena_vtx",
        "failsafe_rtl",
        "gps_com_bussola",
        "bussola_longe_da_potencia",
        "monitor_bateria",
        "twr_minimo",
        "esc_corrente",
        "bateria_c_rating",
      ]) {
        expect(status(id), `${plano.faixa}: ${id}`).toBe("passou");
      }
    }
  });

  it("usa a telemetria pelo ELRS (ADR-0017) e compra o kit ARF", () => {
    for (const plano of result.faixas) {
      expect(plano.build.opcoes.telemetria).toBe("elrs_mavlink");
      expect(plano.build.itens.some((i) => i.componente.id === "holybro-x500-v2-arf")).toBe(true);
      const motores = plano.build.itens.find((i) => i.slot === "motores");
      expect(motores?.fornecido_por).toBe("holybro-x500-v2-arf");
    }
  });

  it("números de voo plausíveis e conferidos com a Holybro", () => {
    for (const plano of result.faixas) {
      const { propulsion, flight } = plano.metricas;
      expect(propulsion.twr).toBeGreaterThan(3);
      expect(propulsion.twr).toBeLessThan(4);
      expect(propulsion.hover?.throttle_pct).toBeGreaterThan(40);
      expect(propulsion.hover?.throttle_pct).toBeLessThan(55);
      // Holybro: ~18 min pairando com 5000 mAh; com 3300 mAh a conta proporcional dá ~12 min.
      expect(flight.max_minutos).toBeGreaterThan(10);
      expect(flight.max_minutos).toBeLessThan(14);
    }
  });

  it("premium custa mais que a econômica, e tudo tem preço (exceto o EPI sem preço pesquisado)", () => {
    const [eco, , pre] = result.faixas;
    expect(pre!.custos.total_pecas.min_centavos).toBeGreaterThan(
      eco!.custos.total_pecas.min_centavos,
    );
    for (const plano of result.faixas) {
      expect(plano.custos.pecas.every((p) => p.origem !== "sem_preco")).toBe(true);
      expect(plano.custos.usa_importacao).toBe(true);
      expect(plano.custos.sem_preco.sort()).toEqual(
        ["Extintor de incêndio", "Kit de primeiros socorros", "Toalha grande"].sort(),
      );
    }
  });
});

describe("Arquétipo 1: projeto completo (painéis)", () => {
  const plano = result.faixas[0]!;
  const projeto = buildProjectReport(plano.build, archetype, catalog, DEFAULT_DRONE_CONFIG);

  it("guia com 25 a 45 passos e checkpoints antes dos passos críticos", () => {
    expect(projeto.passos.length).toBeGreaterThanOrEqual(25);
    expect(projeto.passos.length).toBeLessThanOrEqual(45);
    const comCheckpoint = projeto.passos.filter((p) => p.checkpoint).map((p) => p.id);
    expect(comCheckpoint).toEqual(
      expect.arrayContaining([
        "teste-curto",
        "direcao-motores",
        "instalar-helices",
        "primeiro-voo",
        "teste-rtl",
      ]),
    );
  });

  it("parâmetros calculados para a bateria escolhida (4S 3300 mAh)", () => {
    const valor = (nome: string) => projeto.parametros.find((p) => p.nome === nome)?.valor;
    expect(valor("BATT_CAPACITY")).toBe(3300);
    expect(valor("BATT_LOW_MAH")).toBe(660);
    expect(valor("BATT_LOW_VOLT")).toBe(14);
    expect(valor("SERIAL1_PROTOCOL")).toBe(2);
    expect(valor("SERIAL1_BAUD")).toBe(460);
    expect(valor("BRD_SAFETY_DEFLT")).toBe(0);
    expect(valor("RTL_ALT_M")).toBe(30);
    expect(projeto.parametros_pendentes).toEqual([]);
  });

  it("alertas obrigatórios presentes", () => {
    const ids = projeto.alertas.map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "lipo",
        "helices",
        "solda",
        "primeiro-power-on",
        "regulamentacao",
        "simulador",
        "acima-250g",
        "rtl-sem-desvio",
        "vtx-anatel",
        "video-e-visada",
      ]),
    );
    expect(ids).not.toContain("celular-experimental");
  });

  it("dificuldade derivada dos passos, com a fórmula da SPEC", () => {
    expect(projeto.dificuldade.formula).toContain("0.6 × nível máximo");
    expect(projeto.dificuldade.dominios.length).toBeGreaterThanOrEqual(6);
    expect(projeto.dificuldade.horas_totais[0]).toBeGreaterThan(0);
  });

  it("onde fazer: casa, campo e compras", () => {
    const locais = projeto.locais.map((l) => l.local);
    expect(locais).toEqual(expect.arrayContaining(["comprar_pronto", "em_casa", "espaco_aberto"]));
    expect(locais).not.toContain("servico_externo");
  });
});

describe('Arquétipo 1: comparação de tamanho (450 mm × 5")', () => {
  const fpv = catalog.arquetipos.find((a) => a.id === "a2-fpv-5pol");
  if (!fpv) throw new Error("arquétipo a2-fpv-5pol não está no catálogo");
  const plano450 = result.faixas[0]!;
  const plano5 = solve({ archetype: fpv, catalog, config: DEFAULT_DRONE_CONFIG }).faixas[0]!;
  const comparacao = compareSizeClasses(
    archetype,
    [
      {
        rotulo: "Classe 450 mm (X500 V2)",
        plano: plano450,
        dificuldade: computeDifficulty(plano450.build, archetype, DEFAULT_DRONE_CONFIG),
      },
      {
        rotulo: 'Classe 5" (FPV)',
        plano: plano5,
        dificuldade: computeDifficulty(plano5.build, fpv, DEFAULT_DRONE_CONFIG),
      },
    ],
    catalog,
    DEFAULT_DRONE_CONFIG,
  );
  const valor = (id: string, rotulo: string) =>
    comparacao.criterios.find((k) => k.id === id)?.valores.find((v) => v.rotulo === rotulo)?.valor;

  it('escolhe a classe 450 mm e explica por que o 5" não atende', () => {
    expect(comparacao.escolha).toBe("Classe 450 mm (X500 V2)");
    const cinco = comparacao.candidatos.find((c) => c.rotulo === 'Classe 5" (FPV)');
    expect(cinco?.atende).toBe(false);
    expect(cinco?.faltando.join(" ")).toContain("GPS com bússola");
    expect(comparacao.explicacao).toContain("não atende");
  });

  it('mostra os números: o 5" é mais violento, voa menos e tem menos espaço para montar', () => {
    const a = "Classe 450 mm (X500 V2)";
    const b = 'Classe 5" (FPV)';
    expect(valor("seguranca", b)!).toBeGreaterThan(2 * valor("seguranca", a)!);
    expect(valor("autonomia", b)!).toBeLessThan(valor("autonomia", a)!);
    expect(valor("espaco_montagem", b)!).toBeLessThan(valor("espaco_montagem", a)!);
    const soma = comparacao.criterios.reduce((s, k) => s + k.peso, 0);
    expect(soma).toBeCloseTo(1, 9);
  });
});
