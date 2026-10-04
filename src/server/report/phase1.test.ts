import { describe, expect, it } from "vitest";

import { DEFAULT_DRONE_CONFIG } from "@/domain/categories/drone/config";
import { buildProjectReport } from "@/domain/categories/drone/project";
import { solve } from "@/domain/categories/drone/solver";
import { loadDroneCatalog } from "@/server/catalog/load";

import { phase1Report } from "./phase1";

const { catalog } = loadDroneCatalog();
const config = DEFAULT_DRONE_CONFIG;

describe("pnpm report (builds de referência no terminal)", () => {
  const texto = phase1Report(catalog, config);

  it("mostra os 3 arquétipos × 3 faixas e a comparação de tamanho", () => {
    for (const a of catalog.arquetipos) expect(texto).toContain(`(${a.id})`);
    for (const faixa of ["econômica", "equilibrada", "premium"]) {
      expect(texto.split(`── Faixa ${faixa} ──`).length - 1).toBe(catalog.arquetipos.length);
    }
    expect(texto).toContain('Comparação de tamanho: 450 mm × 5"');
    expect(texto).not.toContain("SEM SOLUÇÃO");
  });

  it("não deixa escapar valor vazio nem conta quebrada", () => {
    expect(texto).not.toMatch(/undefined|NaN|\[object/);
  });

  it("filtra por arquétipo e avisa quando o filtro não encontra nada", () => {
    const so3 = phase1Report(catalog, config, { filtro: "a3" });
    expect(so3).toContain("(a3-tiny-whoop)");
    expect(so3).not.toContain("(a1-gps-filmagem)");
    expect(phase1Report(catalog, config, { filtro: "zz" })).toContain("Nenhum arquétipo");
  });
});

/*
 * Textos que o motor gera (explicações técnicas, sugestões, premissas, fórmula) vão para a
 * interface em PT-BR: decimal com vírgula ("1,2×", não "1.2×"). Furação ("30.5x30.5 M3",
 * "Ø6.6 3xM1.4") é o código da peça, como o fabricante escreve, e fica de fora.
 */
describe("textos gerados em PT-BR", () => {
  const FURACAO =
    /Ø\d+(?:\.\d+)? \d+xM\d+(?:\.\d+)?|\d+(?:\.\d+)?x\d+(?:\.\d+)?(?: M\d+(?:\.\d+)?)?/g;
  // Ponto seguido de exatamente 3 dígitos é separador de milhar em PT-BR ("5.328 g").
  const DECIMAL_COM_PONTO = /(?<![\w.])\d+\.(?!\d{3}(?!\d))\d+(?![\w.])/;

  it("usam vírgula decimal e nunca mostram undefined/NaN", () => {
    const problemas: string[] = [];
    for (const archetype of catalog.arquetipos) {
      for (const plano of solve({ archetype, catalog, config }).faixas) {
        const r = buildProjectReport(plano.build, archetype, catalog, config);
        const textos = [
          ...r.validacao.resultados.flatMap((x) => [x.explicacao_tecnica, x.sugestao ?? ""]),
          ...r.metricas.flight.premissas,
          r.dificuldade.formula,
          ...plano.escolhas.map((e) => e.motivo),
        ];
        for (const t of textos) {
          const limpo = t.replace(FURACAO, "");
          if (DECIMAL_COM_PONTO.test(limpo) || /undefined|NaN/.test(t)) {
            problemas.push(`${archetype.id}/${plano.faixa}: ${t}`);
          }
        }
      }
    }
    expect(problemas).toEqual([]);
  });
});
