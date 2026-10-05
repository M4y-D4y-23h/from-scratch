import { describe, expect, it } from "vitest";

import { importParamsSchema } from "@/domain/core/importacao";

import {
  baseBuild,
  item,
  makeComponent,
  parts,
  TEST_ARCHETYPE,
  TEST_FIRMWARE,
  THRUST_TABLE,
  tweak,
} from "./__fixtures__/builds";
import type { Build } from "./build";
import type { DroneCatalog } from "./catalog";
import { DEFAULT_DRONE_CONFIG as CONFIG } from "./config";
import { computeCosts } from "./costs";
import { computeDifficulty } from "./difficulty";
import { computeLocations } from "./locations";
import { projectAlerts } from "./safety";
import { applyPurchasePlan, candidatesFor, defaultTelemetry, solve } from "./solver";
import { computeMetrics } from "./compatibility";
import { type Archetype, buildStepTemplateSchema, toolSchema } from "./schema";

const IMPORT = importParamsSchema.parse({
  verificado_em: "2026-10-04",
  cambio: {
    usd_brl: 5,
    data: "2026-10-02",
    fonte: { titulo: "teste", tipo: "documentacao_oficial" },
  },
  icms_pct: [17, 20],
  faixas_ii: [
    { ate_usd: 50, aliquota_pct: 0, deducao_usd: 0 },
    { ate_usd: 3000, aliquota_pct: 60, deducao_usd: 30 },
  ],
  fontes: [{ titulo: "teste", tipo: "norma" }],
  aviso: "Confira as regras vigentes.",
});

const step = (over: Record<string, unknown>) =>
  buildStepTemplateSchema.parse({
    titulo: "Passo",
    objetivo: "Fazer algo.",
    por_que_importa: "Importa.",
    tempo_min: [60, 120],
    dominios: {},
    como_saber_que_deu_certo: ["Deu certo."],
    local: "em_casa",
    ...over,
  });

const tool = (over: Record<string, unknown>) =>
  toolSchema.parse({
    nome: "Ferramenta",
    tipo: "ferramenta",
    prioridade: "essencial",
    para_que_serve: "Serve.",
    por_que_necessaria: "Precisa.",
    preco_estimado_brl: { min: 100, max: 200, data: "2026-10-01" },
    onde_comprar: [{ tipo_loja: "loja_ferramentas", termo_busca: "ferramenta" }],
    ...over,
  });

const ARCHETYPE: Archetype = {
  ...TEST_ARCHETYPE,
  perfil_firmware: TEST_FIRMWARE.id,
  passos: [
    step({ id: "soldar", ferramentas: ["ferro"], dominios: { eletronica_solda: 2, mecanica: 1 } }),
    step({ id: "configurar", dominios: { firmware_config: 3 }, tempo_min: [30, 60] }),
    step({ id: "voar", local: "espaco_aberto", dominios: { pilotagem_testes: 3 } }),
    step({
      id: "wifi",
      ferramentas: ["chave"],
      dominios: { radio_video: 4 },
      condicao: { telemetria: ["elrs_mavlink"] },
    }),
    step({ id: "ajuste-fino", dominios: { firmware_config: 5 }, opcional: true }),
  ],
};

function catalogWith(over: Partial<DroneCatalog> = {}): DroneCatalog {
  return {
    componentes: [],
    empuxo: [THRUST_TABLE],
    ferramentas: [
      tool({ id: "ferro" }),
      tool({ id: "chave", preco_estimado_brl: undefined }),
      tool({
        id: "luvas",
        tipo: "epi",
        preco_estimado_brl: { min: 10, max: 20, data: "2026-10-01" },
      }),
      tool({ id: "pinca", prioridade: "recomendada" }),
    ],
    arquetipos: [ARCHETYPE],
    perfis_firmware: [TEST_FIRMWARE],
    prontos: [],
    importacao: IMPORT,
    ...over,
  };
}

describe("custos", () => {
  it("compra por pacote: 8 hélices em pacotes de 4 = 2 pacotes", () => {
    const build: Build = {
      ...baseBuild(),
      itens: [item("helices", tweak(parts.prop(), {}, { unidades_por_pacote: 4 }), 4, 8)],
    };
    const c = computeCosts(build, ARCHETYPE, catalogWith());
    expect(c.pecas[0]).toMatchObject({ quantidade: 2, origem: "brl" });
    // R$ 10–20 por pacote.
    expect(c.total_pecas).toMatchObject({ min_centavos: 2000, max_centavos: 4000 });
  });

  it("peça com preço só em US$ é convertida pelo parâmetro de importação", () => {
    const usd = tweak(
      parts.esc(),
      {},
      {
        preco_estimado_brl: undefined,
        preco_referencia_usd: {
          min: 40,
          max: 40,
          data: "2026-10-04",
          loja: "Loja",
          fontes: [{ titulo: "x", tipo: "loja" }],
        },
      },
    );
    const build: Build = { ...baseBuild(), itens: [item("escs", usd, 1)] };
    const c = computeCosts(build, ARCHETYPE, catalogWith());
    expect(c.pecas[0]?.origem).toBe("importacao");
    expect(c.usa_importacao).toBe(true);
    expect(c.aviso_importacao).toBe("Confira as regras vigentes.");
    // 40 / 0,83 × 5 (sem II até US$ 50, ICMS 17%).
    expect(c.total_pecas.min_centavos).toBe(Math.round((40 / 0.83) * 5 * 100));
  });

  it("peça que vem na caixa de outra não custa nada", () => {
    const build: Build = {
      ...baseBuild(),
      itens: [{ ...item("motores", parts.motor(), 4), fornecido_por: "kit-x" }],
    };
    const c = computeCosts(build, ARCHETYPE, catalogWith());
    expect(c.pecas[0]).toMatchObject({ origem: "incluido", incluido_em: "kit-x" });
    expect(c.total_pecas.min_centavos).toBe(0);
  });

  it("reservas além do que vem no kit são compradas à parte (o kit traz 6, o projeto pede 10)", () => {
    const helice = tweak(parts.prop(), {}, { unidades_por_pacote: 4 });
    const kit = makeComponent({
      categoria: "kit",
      id: "kit-x",
      specs: {},
      inclui: [{ componente_id: helice.id, quantidade: 6 }],
    });
    const build: Build = {
      ...baseBuild(),
      itens: [
        { ...item("helices", helice, 4, 10), fornecido_por: "kit-x" },
        { ...item("kit:kit-x", kit, 0, 1) },
      ],
    };
    const c = computeCosts(build, ARCHETYPE, catalogWith());
    // 10 − 6 = 4 hélices a mais = 1 pacote de 4 (R$ 10–20), mais o kit (R$ 10–20).
    expect(c.pecas[0]).toMatchObject({ quantidade: 1, origem: "brl", incluido_em: "kit-x" });
    expect(c.total_pecas).toMatchObject({ min_centavos: 2000, max_centavos: 4000 });

    const semReserva = computeCosts(
      { ...build, itens: [{ ...item("helices", helice, 4, 6), fornecido_por: "kit-x" }] },
      ARCHETYPE,
      catalogWith(),
    );
    expect(semReserva.pecas[0]).toMatchObject({ origem: "incluido", quantidade: 0 });
  });

  it("ferramentas: só as dos passos que valem + EPI essencial; 'já tenho' sai do total", () => {
    const c = computeCosts(baseBuild(), ARCHETYPE, catalogWith());
    // Build Wi-Fi: o passo "wifi" (chave) não vale; entram ferro e o EPI.
    expect(c.ferramentas.map((f) => f.id).sort()).toEqual(["ferro", "luvas"]);
    expect(c.total_ferramentas).toMatchObject({ min_centavos: 11000, max_centavos: 22000 });
    const jaTenho = computeCosts(baseBuild(), ARCHETYPE, catalogWith(), new Set(["ferro"]));
    expect(jaTenho.ja_tenho).toEqual(["Ferramenta"]);
    expect(jaTenho.total_ferramentas.min_centavos).toBe(1000);
  });

  it("ferramenta sem preço pesquisado aparece à parte e não soma", () => {
    const build = baseBuild();
    const mavlink = { ...build, opcoes: { ...build.opcoes, telemetria: "elrs_mavlink" as const } };
    const c = computeCosts(mavlink, ARCHETYPE, catalogWith());
    expect(c.sem_preco).toContain("Ferramenta");
    expect(c.ferramentas.find((f) => f.id === "chave")?.origem).toBe("sem_preco");
  });
});

describe("dificuldade", () => {
  it("nível do domínio = maior nível dos passos; opcionais e condicionais fora", () => {
    const d = computeDifficulty(baseBuild(), ARCHETYPE, CONFIG);
    const nivel = (dom: string) => d.dominios.find((x) => x.dominio === dom)?.nivel;
    expect(nivel("firmware_config")).toBe(3); // o opcional (nível 5) não conta
    expect(nivel("radio_video")).toBeUndefined(); // passo só para ELRS MAVLink
    expect(nivel("eletronica_solda")).toBe(2);
  });

  it("nota = 0,6 × máximo + 0,4 × média ponderada pelas horas", () => {
    const d = computeDifficulty(baseBuild(), ARCHETYPE, CONFIG);
    // Horas (ponto médio): solda 1,5 h (n2), mecânica 1,5 h (n1), firmware 0,75 h (n3), pilotagem 1,5 h (n3).
    const media = (2 * 1.5 + 1 * 1.5 + 3 * 0.75 + 3 * 1.5) / (1.5 + 1.5 + 0.75 + 1.5);
    expect(d.nota).toBeCloseTo(0.6 * 3 + 0.4 * media, 2);
    expect(d.rotulo).toBe("Avançado");
  });

  it("horas totais = aprendizado + passos", () => {
    const d = computeDifficulty(baseBuild(), ARCHETYPE, CONFIG);
    const aprendizado = d.dominios.reduce((s, x) => s + x.horas_aprendizado[0], 0);
    expect(d.horas_totais[0]).toBeCloseTo(aprendizado + 2.5, 6);
  });
});

describe("onde fazer", () => {
  it("separa casa, campo e compras, com horas e ferramentas", () => {
    const locais = computeLocations(baseBuild(), ARCHETYPE, catalogWith());
    const casa = locais.find((l) => l.local === "em_casa");
    expect(casa?.passos.map((p) => p.id)).toEqual(["soldar", "configurar", "ajuste-fino"]);
    expect(casa?.ferramentas).toEqual(["Ferramenta"]);
    expect(locais.find((l) => l.local === "espaco_aberto")?.alertas).toEqual(["regulamentacao"]);
    expect(locais.find((l) => l.local === "comprar_pronto")?.compras?.length).toBe(
      baseBuild().itens.length,
    );
    expect(locais.some((l) => l.local === "servico_externo")).toBe(false);
  });
});

describe("alertas do projeto", () => {
  const metrics = computeMetrics({
    build: baseBuild(),
    archetype: ARCHETYPE,
    thrustTables: [THRUST_TABLE],
    config: CONFIG,
  });
  const comAlertas: Archetype = {
    ...ARCHETYPE,
    alertas: [
      { id: "iphone", nivel: "info", titulo: "iPhone", texto: "x", acoes: [], fontes: [] },
      {
        id: "celular-experimental",
        nivel: "perigo",
        titulo: "celular",
        texto: "x",
        acoes: [],
        fontes: [],
      },
      {
        id: "acima-250g",
        nivel: "regulatorio",
        titulo: "250 g",
        texto: "x",
        acoes: [],
        fontes: [],
      },
      { id: "sempre", nivel: "info", titulo: "sempre", texto: "x", acoes: [], fontes: [] },
    ],
  };

  it("globais sempre; do arquétipo conforme as opções; vídeo pede visada direta", () => {
    const ids = projectAlerts(baseBuild(), comAlertas, metrics).map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining(["lipo", "helices", "acima-250g", "sempre", "video-e-visada"]),
    );
    expect(ids).not.toContain("iphone");
    expect(ids).not.toContain("celular-experimental");
  });

  it("iPhone, controle pelo celular e uso não recreativo geram seus alertas", () => {
    const b = baseBuild();
    const build = {
      ...b,
      opcoes: {
        ...b.opcoes,
        celular: "ios" as const,
        controle: "celular_experimental" as const,
        uso: "nao_recreativo" as const,
      },
    };
    const ids = projectAlerts(build, comAlertas, metrics).map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining(["iphone", "celular-experimental", "uso-nao-recreativo"]),
    );
  });
});

describe("solver", () => {
  const archetypeSolver: Archetype = {
    ...ARCHETYPE,
    slots: [
      { slot: "frame", categorias: ["frame"], quantidade: 1, obrigatorio: true, coberto_por: [] },
      { slot: "motores", categorias: ["motor"], quantidade: 4, obrigatorio: true, coberto_por: [] },
      {
        slot: "helices",
        categorias: ["helice"],
        quantidade: 4,
        obrigatorio: true,
        coberto_por: [],
      },
      { slot: "escs", categorias: ["esc"], quantidade: 4, obrigatorio: true, coberto_por: [] },
      { slot: "fc", categorias: ["fc"], quantidade: 1, obrigatorio: true, coberto_por: [] },
      {
        slot: "bateria",
        categorias: ["bateria"],
        quantidade: 1,
        obrigatorio: true,
        coberto_por: [],
        compra_por_faixa: { economica: 1, equilibrada: 2, premium: 3 },
      },
      {
        slot: "receptor",
        categorias: ["receptor"],
        quantidade: 1,
        obrigatorio: true,
        coberto_por: [],
      },
      {
        slot: "radio",
        categorias: ["radio_tx"],
        quantidade: 1,
        obrigatorio: true,
        coberto_por: [],
      },
      { slot: "gps", categorias: ["gps"], quantidade: 1, obrigatorio: true, coberto_por: [] },
      {
        slot: "mastro",
        categorias: ["mastro_gps"],
        quantidade: 1,
        obrigatorio: true,
        coberto_por: [],
      },
      {
        slot: "telemetria",
        categorias: ["telemetria"],
        quantidade: 1,
        obrigatorio: false,
        coberto_por: [],
      },
    ],
  };
  const escFraco = tweak(
    parts.esc(),
    { corrente_continua_a: 10 },
    { id: "esc-fraco", preco_estimado_brl: { min: 1, max: 2, data: "2026-10-04" } },
  );
  const escCaro = tweak(
    parts.esc(),
    {},
    {
      id: "esc-caro",
      preco_estimado_brl: { min: 90, max: 99, data: "2026-10-04" },
      faixas: ["premium"],
    },
  );
  const kit = makeComponent({
    categoria: "kit",
    id: "kit-propulsao",
    specs: {},
    inclui: [
      { componente_id: "motor-teste", quantidade: 4 },
      { componente_id: "helice-teste", quantidade: 4 },
    ],
  });
  const catalog = catalogWith({
    componentes: [
      parts.frame(),
      parts.motor(),
      parts.prop(),
      parts.esc(),
      escFraco,
      escCaro,
      parts.fc(),
      parts.battery(),
      parts.receiver(),
      parts.radio(),
      parts.gps(),
      parts.mast(),
      parts.telemetry(),
      kit,
    ],
    arquetipos: [archetypeSolver],
  });
  const result = solve({ archetype: archetypeSolver, catalog, config: CONFIG });

  it("descarta combinação com falha bloqueante, mesmo sendo a mais barata", () => {
    for (const plano of result.faixas) {
      expect(plano.build.itens.find((i) => i.slot === "escs")?.componente.id).not.toBe("esc-fraco");
    }
  });

  it("respeita as marcas de faixa do curador", () => {
    expect(
      candidatesFor(archetypeSolver.slots[3]!, catalog, "economica").map((c) => c.id),
    ).not.toContain("esc-caro");
    expect(candidatesFor(archetypeSolver.slots[3]!, catalog, "premium").map((c) => c.id)).toContain(
      "esc-caro",
    );
    // Na premium o ESC caro é permitido, mas o barato e válido ainda ganha.
    expect(
      result.faixas.find((f) => f.faixa === "premium")?.build.itens.find((i) => i.slot === "escs")
        ?.componente.id,
    ).toBe("esc-teste");
  });

  it("compra o kit quando ele traz várias peças escolhidas", () => {
    const plano = result.faixas[0]!;
    expect(plano.build.itens.find((i) => i.slot === "motores")?.fornecido_por).toBe(
      "kit-propulsao",
    );
    expect(plano.build.itens.some((i) => i.componente.id === "kit-propulsao")).toBe(true);
  });

  it("telemetria pelo ELRS quando rádio e receptor permitem; sem módulo Wi-Fi à toa", () => {
    for (const plano of result.faixas) {
      expect(plano.build.opcoes.telemetria).toBe("elrs_mavlink");
      expect(plano.build.itens.some((i) => i.componente.categoria === "telemetria")).toBe(false);
    }
  });

  it("baterias compradas por faixa e escolhas explicadas", () => {
    expect(
      result.faixas.map((f) => f.build.itens.find((i) => i.slot === "bateria")?.quantidade_compra),
    ).toEqual([1, 2, 3]);
    expect(result.faixas[0]!.escolhas.find((e) => e.slot === "escs")?.motivo).toContain(
      "opções desta faixa",
    );
  });

  it("sem peça para um slot obrigatório, a faixa fica sem solução com o motivo", () => {
    const semGps = solve({
      archetype: archetypeSolver,
      catalog: {
        ...catalog,
        componentes: catalog.componentes.filter((c) => c.categoria !== "gps"),
      },
      config: CONFIG,
    });
    expect(semGps.faixas).toEqual([]);
    expect(semGps.sem_solucao[0]?.motivos[0]).toContain("gps");
  });

  it("telemetria padrão sem backpack cai para Wi-Fi (se houver módulo) ou nenhuma", () => {
    const b = baseBuild();
    const semBackpack: Build = {
      ...b,
      itens: b.itens.map((i) =>
        i.slot === "radio"
          ? { ...i, componente: tweak(i.componente, { backpack_wifi: false }) }
          : i,
      ),
    };
    expect(defaultTelemetry(semBackpack)).toBe("wifi_no_drone");
    expect(
      defaultTelemetry({
        ...semBackpack,
        itens: semBackpack.itens.filter((i) => i.slot !== "telemetria"),
      }),
    ).toBe("nenhuma");
  });

  it("peça que vem na caixa de outra é marcada como incluída", () => {
    const vtx = tweak(
      parts.vtx(),
      {},
      { inclui: [{ componente_id: "antena-teste", quantidade: 1 }] },
    );
    const b = baseBuild();
    const build = applyPurchasePlan(
      { ...b, itens: b.itens.map((i) => (i.slot === "vtx" ? { ...i, componente: vtx } : i)) },
      catalog,
    );
    expect(build.itens.find((i) => i.slot === "antena_video")?.fornecido_por).toBe("vtx-teste");
  });
});
