import { describe, expect, it } from "vitest";

import { missingRelatedTerms, parseGlossary } from "./glossary";

const SAMPLE = [
  "# Glossário",
  "",
  "Introdução que deve ser ignorada.",
  "- **Explicação:** isto é da introdução",
  "",
  "## KV",
  "",
  "- **Explicação:** rotações por volt,",
  "  sem carga.",
  "- **Analogia:** marchas da bicicleta.",
  "- **Relacionados:** Hélice, Célula, 5,8 GHz",
  "",
  "## Hélice",
  "",
  "- **Explicação:** gira e empurra o ar.",
  "- **Relacionados:** KV",
].join("\r\n");

describe("parseGlossary", () => {
  it("lê termos, junta linhas de continuação e aceita CRLF", () => {
    const { termos, problemas } = parseGlossary(SAMPLE);
    expect(problemas).toEqual([]);
    expect(termos).toHaveLength(2);
    expect(termos[0]).toEqual({
      termo: "KV",
      explicacao: "rotações por volt, sem carga.",
      analogia: "marchas da bicicleta.",
      relacionados: ["Hélice", "Célula", "5,8 GHz"],
    });
    expect(termos[1]?.analogia).toBeUndefined();
  });

  it("aponta termo sem explicação e termo repetido", () => {
    const { problemas } = parseGlossary(
      "## A\n\n- **Analogia:** x\n\n## B\n- **Explicação:** y\n## b\n- **Explicação:** z",
    );
    expect(problemas).toHaveLength(2);
  });

  it("lista relacionados sem verbete", () => {
    const { termos } = parseGlossary(SAMPLE);
    expect(missingRelatedTerms(termos)).toEqual(["5,8 GHz", "Célula"]);
  });
});
