import { describe, expect, it } from "vitest";

import { compileGlossary, missingRelatedTerms, splitGlossary } from "@/domain/core/glossary";
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

  it("'receptor' de vídeo não abre a explicação do receptor do rádio (textos reais)", () => {
    const matcher = compileGlossary(termos);
    const termoDe = (texto: string, trecho: string) =>
      splitGlossary(texto, matcher).find((s) => s.texto.toLowerCase().startsWith(trecho))?.termo;

    // Regras, passos e peças do catálogo.
    expect(termoDe("O LED do receptor fica aceso fixo.", "receptor")).toBe("Receptor");
    expect(termoDe("Receptor de vídeo para o celular", "receptor")).toBe("Receptor de vídeo");
    expect(
      termoDe("Os receptores de vídeo USB também costumam funcionar só no Android.", "receptores"),
    ).toBe("Receptor de vídeo");
    expect(termoDe("Ligar o receptor OTG no celular Android", "receptor")).toBeUndefined();
    expect(
      termoDe("O vídeo do receptor USB também depende do celular.", "receptor"),
    ).toBeUndefined();
    expect(
      termoDe("Inclua câmera, VTX e receptor (USB ou óculos) do mesmo sistema.", "receptor"),
    ).toBeUndefined();
  });
});
