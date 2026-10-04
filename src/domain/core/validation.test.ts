import { describe, expect, it } from "vitest";

import { buildReport, type RuleResult } from "./validation";

const rule = (
  regra_id: string,
  status: RuleResult["status"],
  severidade: RuleResult["severidade"],
): RuleResult => ({
  regra_id,
  titulo: regra_id,
  status,
  severidade,
  selo: "nao_verificado",
  explicacao_leiga: "",
  explicacao_tecnica: "",
});

describe("buildReport", () => {
  it("só falha bloqueante bloqueia o projeto", () => {
    expect(buildReport([rule("a", "falhou", "alerta")]).bloqueado).toBe(false);
    expect(buildReport([rule("a", "falhou", "bloqueante")]).bloqueado).toBe(true);
  });

  it("regra bloqueante sem dado deixa o relatório incompleto (não dá para afirmar que é seguro)", () => {
    const report = buildReport([rule("a", "sem_dado", "bloqueante")]);
    expect(report.incompleto).toBe(true);
    expect(report.bloqueado).toBe(false);
    expect(buildReport([rule("a", "sem_dado", "alerta")]).incompleto).toBe(false);
  });

  it("conta os resultados por status", () => {
    const report = buildReport([
      rule("a", "passou", "bloqueante"),
      rule("b", "passou", "alerta"),
      rule("c", "falhou", "alerta"),
      rule("d", "sem_dado", "bloqueante"),
    ]);
    expect(report.contagem).toEqual({ passou: 2, falhou: 1, sem_dado: 1 });
  });
});
