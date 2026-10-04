import { describe, expect, it } from "vitest";

import { deriveStatus, SEAL, weakestStatus } from "./verification";

describe("weakestStatus", () => {
  it("lista vazia significa que nada foi informado: não verificado", () => {
    expect(weakestStatus([])).toBe("nao_verificado");
  });

  it("devolve o selo mais fraco", () => {
    expect(weakestStatus(["verificado", "estimativa"])).toBe("estimativa");
    expect(weakestStatus(["verificado", "nao_verificado", "estimativa"])).toBe("nao_verificado");
    expect(weakestStatus(["verificado", "verificado"])).toBe("verificado");
  });
});

describe("deriveStatus", () => {
  it("comparação direta entre specs verificadas continua verificada", () => {
    expect(deriveStatus(["verificado", "verificado"], "comparacao")).toBe("verificado");
  });

  it("um cálculo (estimativa) nunca passa de ⚠️, mesmo com entradas verificadas", () => {
    expect(deriveStatus(["verificado", "verificado"], "estimativa")).toBe("estimativa");
  });

  it("uma entrada não verificada contamina o resultado", () => {
    expect(deriveStatus(["verificado", "nao_verificado"], "comparacao")).toBe("nao_verificado");
    expect(deriveStatus(["verificado", "nao_verificado"], "estimativa")).toBe("nao_verificado");
  });
});

describe("SEAL", () => {
  it("usa os símbolos da SPEC", () => {
    expect(SEAL.verificado.simbolo).toBe("✅");
    expect(SEAL.estimativa.simbolo).toBe("⚠️");
    expect(SEAL.nao_verificado.simbolo).toBe("❓");
  });
});
