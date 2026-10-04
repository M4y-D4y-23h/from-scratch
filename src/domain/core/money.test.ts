import { describe, expect, it } from "vitest";

import {
  type CentsRange,
  formatBRL,
  formatRange,
  priceRangeSchema,
  priceToCents,
  sumRanges,
  toCents,
  ZERO_RANGE,
} from "./money";

// O Intl usa espaço inseparável depois de "R$"; normalizamos para comparar.
const plain = (s: string) => s.replace(/\s/g, " ");

const range = (
  min: number,
  max: number,
  status: CentsRange["status"],
  data_mais_antiga?: string,
): CentsRange => ({ min_centavos: min, max_centavos: max, status, data_mais_antiga });

describe("priceRangeSchema", () => {
  it("preenche selo ⚠️ e fontes vazias por padrão", () => {
    const p = priceRangeSchema.parse({ min: 10, max: 20, data: "2026-10-04" });
    expect(p.status).toBe("estimativa");
    expect(p.fontes).toEqual([]);
  });

  it("recusa faixa invertida e data inválida", () => {
    expect(() => priceRangeSchema.parse({ min: 20, max: 10, data: "2026-10-04" })).toThrow();
    expect(() => priceRangeSchema.parse({ min: 1, max: 2, data: "04/10/2026" })).toThrow();
  });
});

describe("centavos", () => {
  it("converte sem erro de ponto flutuante", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("multiplica pela quantidade comprada", () => {
    const p = priceRangeSchema.parse({ min: 10.5, max: 20, data: "2026-10-04" });
    expect(priceToCents(p, 4)).toMatchObject({ min_centavos: 4200, max_centavos: 8000 });
  });
});

describe("sumRanges", () => {
  it("soma vazia é zero", () => {
    expect(sumRanges([])).toEqual(ZERO_RANGE);
  });

  it("soma mínimos e máximos e guarda a data mais antiga", () => {
    const total = sumRanges([
      range(1000, 2000, "estimativa", "2026-10-04"),
      range(500, 700, "estimativa", "2026-09-01"),
    ]);
    expect(total.min_centavos).toBe(1500);
    expect(total.max_centavos).toBe(2700);
    expect(total.data_mais_antiga).toBe("2026-09-01");
  });

  it("um total de preços é sempre estimativa; um preço não verificado contamina", () => {
    expect(sumRanges([range(1, 2, "verificado"), range(1, 2, "verificado")]).status).toBe(
      "estimativa",
    );
    expect(sumRanges([range(1, 2, "verificado"), range(1, 2, "nao_verificado")]).status).toBe(
      "nao_verificado",
    );
  });
});

describe("formatação em reais", () => {
  it("usa o formato brasileiro", () => {
    expect(plain(formatBRL(123456))).toBe("R$ 1.234,56");
  });

  it("mostra faixa ou valor único", () => {
    expect(plain(formatRange(range(1000, 2000, "estimativa")))).toBe("R$ 10,00 a R$ 20,00");
    expect(plain(formatRange(range(1000, 1000, "estimativa")))).toBe("R$ 10,00");
  });
});
