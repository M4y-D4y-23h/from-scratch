import { describe, expect, it } from "vitest";

import { DEFAULT_DRONE_CONFIG } from "@/domain/categories/drone/config";
import { loadDroneCatalog } from "@/server/catalog/load";
import { simpleAnalyzer } from "@/server/pipeline/run";

import { EVAL_CASES } from "../evals/casos";
import { runEvalCase } from "../evals/run-cases";

/*
 * Os evals da SPEC B.17 no modo simples (palavras-chave, sem IA e sem custo). Com o Claude, os
 * mesmos casos rodam em `pnpm eval` (que mostra o custo estimado e pede confirmação antes).
 */

const loaded = loadDroneCatalog();
const ctx = { loaded, config: DEFAULT_DRONE_CONFIG };
const deps = { loaded, analisar: simpleAnalyzer };

describe("evals 1–12 (SPEC B.17) no modo simples", () => {
  it.each(EVAL_CASES.map((caso) => [caso.id, caso] as const))("caso %s", async (_, caso) => {
    const relatorio = await runEvalCase(caso, deps, ctx);
    const falhas = relatorio.etapas.flatMap((e) =>
      e.criterios
        .filter((c) => !c.ok)
        .map(
          (c) =>
            `etapa ${e.etapa} (${e.tipo}): ${c.descricao}${c.detalhe ? ` [${c.detalhe}]` : ""}`,
        ),
    );
    expect(relatorio.erro).toBeUndefined();
    expect(falhas).toEqual([]);
  });
});
