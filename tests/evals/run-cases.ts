import type { Answers } from "@/domain/categories/drone/pipeline/choose";
import { type PipelineDeps, runPipeline } from "@/server/pipeline/run";

import type { Criterion, EvalCase, EvalContext } from "./casos";

/* Roda um caso de eval etapa por etapa (pedido; depois as respostas clicadas). */

export type StepReport = {
  etapa: number;
  respostas?: Answers;
  tipo: string;
  modo: string;
  criterios: Criterion[];
};
export type CaseReport = {
  id: string;
  pedido: string;
  esperado: string;
  ok: boolean;
  etapas: StepReport[];
  erro?: string;
};

export async function runEvalCase(
  caso: EvalCase,
  deps: PipelineDeps,
  ctx: EvalContext,
): Promise<CaseReport> {
  const etapas: StepReport[] = [];
  try {
    for (const [i, etapa] of caso.etapas.entries()) {
      const r = await runPipeline({ pedido: caso.pedido, respostas: etapa.respostas ?? {} }, deps);
      etapas.push({
        etapa: i + 1,
        respostas: etapa.respostas,
        tipo: r.tipo,
        modo: r.modo,
        criterios: etapa.verificar(r, ctx),
      });
    }
  } catch (error) {
    return {
      id: caso.id,
      pedido: caso.pedido,
      esperado: caso.esperado,
      ok: false,
      etapas,
      erro: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    id: caso.id,
    pedido: caso.pedido,
    esperado: caso.esperado,
    ok: etapas.every((e) => e.criterios.every((c) => c.ok)),
    etapas,
  };
}
