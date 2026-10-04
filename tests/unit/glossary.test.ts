import { describe, expect, it } from "vitest";

import { missingRelatedTerms } from "@/domain/core/glossary";
import { loadGlossary } from "@/server/glossary/load";

/*
 * O glossário (docs/GLOSSARIO.md) é a fonte dos tooltips da interface (SPEC B.1.5): todo termo
 * citado em "Relacionados" precisa ter verbete, e os jargões usados nos alertas e regras também.
 */

describe("glossário do projeto", () => {
  const { termos } = loadGlossary();
  const nomes = new Set(termos.map((t) => t.termo));

  it("todo termo relacionado tem verbete", () => {
    expect(missingRelatedTerms(termos)).toEqual([]);
  });

  it("cobre os jargões da SPEC e os que aparecem nos alertas e regras", () => {
    for (const termo of [
      "KV",
      "LiPo",
      "ESC",
      "FC",
      "VTX",
      "TWR",
      "C-rating",
      "Failsafe",
      "RTL",
      "UART",
      "BEC",
      "Hover",
      "Stack",
      "AIO",
      "LiHV",
      "SARPAS",
      "BNF",
      "RTF",
    ]) {
      expect(nomes.has(termo), termo).toBe(true);
    }
  });

  it("cada verbete tem explicação e analogia", () => {
    for (const t of termos) {
      expect(t.explicacao.length, t.termo).toBeGreaterThan(20);
      expect(t.analogia, t.termo).toBeTruthy();
    }
  });
});
