import { describe, expect, it } from "vitest";

import {
  type ImportParams,
  importedPriceRange,
  importParamsSchema,
  importTaxUsd,
} from "./importacao";

const PARAMS: ImportParams = importParamsSchema.parse({
  verificado_em: "2026-10-04",
  cambio: {
    usd_brl: 5.2238,
    data: "2026-10-02",
    fonte: { titulo: "BCB PTAX", tipo: "documentacao_oficial" },
  },
  icms_pct: [17, 20],
  faixas_ii: [
    { ate_usd: 50, aliquota_pct: 0, deducao_usd: 0 },
    { ate_usd: 3000, aliquota_pct: 60, deducao_usd: 30 },
  ],
  fontes: [{ titulo: "Portaria MF 1.342/2026", tipo: "norma" }],
  aviso: "Confira as regras vigentes.",
});

describe("imposto de importação por faixa", () => {
  it("zero até US$ 50; 60% menos US$ 30 até US$ 3.000", () => {
    expect(importTaxUsd(50, PARAMS)).toBe(0);
    expect(importTaxUsd(100, PARAMS)).toBeCloseTo(30, 6);
    // Logo acima de US$ 50 a dedução quase zera o imposto.
    expect(importTaxUsd(50.01, PARAMS)).toBeCloseTo(0.006, 6);
  });

  it("acima da última faixa não há regra simplificada", () => {
    expect(importTaxUsd(3001, PARAMS)).toBeUndefined();
  });
});

describe("faixa em R$ de uma peça importada", () => {
  it("peça de US$ 40: sem II no cenário barato, 60% no caro, ICMS por dentro", () => {
    const r = importedPriceRange({ min: 40, max: 40, data: "2026-10-04" }, PARAMS);
    // 40 / (1 − 0,17) × 5,2238 ≈ R$ 251,75
    expect(r.min_centavos).toBe(Math.round((40 / 0.83) * 5.2238 * 100));
    // 40 × 1,6 / (1 − 0,20) × 5,2238 = R$ 417,90
    expect(r.max_centavos).toBe(Math.round(((40 * 1.6) / 0.8) * 5.2238 * 100));
    expect(r.status).toBe("estimativa");
    expect(r.regra_aplicada).toBe(true);
  });

  it("separa a parte que é imposto (II + ICMS) em cada cenário", () => {
    const r = importedPriceRange({ min: 40, max: 40, data: "2026-10-04" }, PARAMS);
    const semTributos = Math.round(40 * 5.2238 * 100);
    // Barato: só o ICMS de 17% por dentro (sem II até US$ 50).
    expect(r.tributos.min_centavos).toBe(r.min_centavos - semTributos);
    expect(r.tributos.min_centavos).toBe(
      Math.round((40 / 0.83) * 5.2238 * 100) - Math.round(40 * 5.2238 * 100),
    );
    // Caro: 60% de II e ICMS de 20%.
    expect(r.tributos.max_centavos).toBe(r.max_centavos - semTributos);
    expect(r.tributos.max_centavos).toBeGreaterThan(r.tributos.min_centavos);
  });

  it("peça de US$ 100 sozinha no pacote: 60% − US$ 30", () => {
    const r = importedPriceRange({ min: 100, max: 100, data: "2026-10-04" }, PARAMS);
    expect(r.min_centavos).toBe(Math.round((130 / 0.83) * 5.2238 * 100));
  });

  it("multiplica pela quantidade antes de aplicar a faixa (4 motores num pacote)", () => {
    const um = importedPriceRange({ min: 20, max: 20, data: "2026-10-04" }, PARAMS);
    const quatro = importedPriceRange({ min: 20, max: 20, data: "2026-10-04" }, PARAMS, 4);
    // US$ 80 já passa de US$ 50: paga II, então custa mais que 4 × o preço de um.
    expect(quatro.min_centavos).toBeGreaterThan(um.min_centavos * 4);
  });

  it("a data do total é a mais antiga entre preço e câmbio", () => {
    expect(
      importedPriceRange({ min: 1, max: 2, data: "2026-09-01" }, PARAMS).data_mais_antiga,
    ).toBe("2026-09-01");
    expect(
      importedPriceRange({ min: 1, max: 2, data: "2026-10-04" }, PARAMS).data_mais_antiga,
    ).toBe("2026-10-02");
  });
});
