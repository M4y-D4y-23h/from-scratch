import { describe, expect, it } from "vitest";

import { makeComponent } from "./__fixtures__/builds";
import {
  archetypeSchema,
  componentSchema,
  mountPatternSchema,
  normalizeMountPattern,
  thrustDataSchema,
} from "./schema";

describe("furação", () => {
  it("aceita os formatos usados nos datasheets", () => {
    for (const ok of ["16x19 M3", "30.5x30.5 M3", "25.5x25.5 M2", "9x9", "12x12 M2.5"]) {
      expect(mountPatternSchema.safeParse(ok).success, ok).toBe(true);
    }
  });

  it("recusa formatos ambíguos", () => {
    for (const bad of ["16-19", "M3 16x19", "16x19M3", "16 x 19"]) {
      expect(mountPatternSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("normaliza a ordem das medidas para comparar", () => {
    expect(normalizeMountPattern("19x16 M3")).toBe("16x19 M3");
    expect(normalizeMountPattern("30.5x30.5 M3")).toBe("30.5x30.5 M3");
    expect(normalizeMountPattern("9x9")).toBe("9x9");
  });
});

describe("componentSchema", () => {
  const valid = {
    id: "motor-x",
    categoria: "motor",
    marca: "Marca",
    modelo: "Modelo",
    descricao_leiga: "Gira a hélice.",
    preco_estimado_brl: { min: 50, max: 80, data: "2026-10-04" },
    onde_comprar: [{ tipo_loja: "marketplace_nacional", termo_busca: "motor 2212 920kv" }],
    specs: { kv: 920 },
  };

  it("preenche os padrões: sem fonte conferida, a peça nasce ❓", () => {
    const c = componentSchema.parse(valid);
    expect(c.status_verificacao).toBe("nao_verificado");
    expect(c.unidades_por_pacote).toBe(1);
    expect(c.fontes).toEqual([]);
    expect(c.notas_seguranca).toEqual([]);
  });

  it("exige id em minúsculas com hífens e pelo menos um termo de busca", () => {
    expect(componentSchema.safeParse({ ...valid, id: "Motor X" }).success).toBe(false);
    expect(componentSchema.safeParse({ ...valid, onde_comprar: [] }).success).toBe(false);
  });

  it("valida as specs pela categoria", () => {
    expect(componentSchema.safeParse({ ...valid, specs: { kv: -1 } }).success).toBe(false);
    expect(componentSchema.safeParse({ ...valid, categoria: "foguete" }).success).toBe(false);
  });

  it("o helper de testes gera peças válidas", () => {
    expect(makeComponent({ categoria: "gps", specs: {} }).id).toBe("gps-teste");
  });
});

describe("thrustDataSchema", () => {
  it("tabela de empuxo sem fonte não entra no catálogo", () => {
    const table = {
      id: "t",
      motor_id: "m",
      helice_id: "h",
      celulas: 3,
      pontos: [
        { throttle_pct: 50, empuxo_g: 300, corrente_a: 3 },
        { throttle_pct: 100, empuxo_g: 850, corrente_a: 11 },
      ],
    };
    expect(thrustDataSchema.safeParse({ ...table, fontes: [] }).success).toBe(false);
    expect(
      thrustDataSchema.safeParse({ ...table, fontes: [{ titulo: "Datasheet", tipo: "datasheet" }] })
        .success,
    ).toBe(true);
  });
});

describe("archetypeSchema", () => {
  it("recusa faixa invertida", () => {
    const result = archetypeSchema.safeParse({
      id: "a",
      nome: "A",
      descricao: "A",
      para_quem: "A",
      firmware: "ArduPilot",
      faixas: { helice_pol: [9, 11], celulas: [3, 4], massa_alvo_g: [800, 1500], twr_alvo: [4, 2] },
      slots: [{ slot: "frame", categorias: ["frame"], quantidade: 1, obrigatorio: true }],
      orcamento_referencia_brl: { economica: 1, equilibrada: 2, premium: 3 },
      passos: [],
    });
    expect(result.success).toBe(false);
  });
});
