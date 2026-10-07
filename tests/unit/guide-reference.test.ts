import { describe, expect, it } from "vitest";

import { DEFAULT_DRONE_CONFIG } from "@/domain/categories/drone/config";
import { toolsForBuild } from "@/domain/categories/drone/costs";
import { buildGuide, guideState } from "@/domain/categories/drone/guide";
import { buildProjectReport } from "@/domain/categories/drone/project";
import { solve } from "@/domain/categories/drone/solver";
import { loadDroneCatalog } from "@/server/catalog/load";

/*
 * O guia dos 9 builds de referência com o catálogo real (SPEC B.13): tudo o que um passo cita
 * existe no projeto (peças, ferramentas, parâmetros do firmware, alertas) e os passos críticos
 * têm checklist. Pega erro de digitação no catálogo antes de virar um passo pela metade.
 */

const { catalog } = loadDroneCatalog();
const config = DEFAULT_DRONE_CONFIG;

/** Alertas do arquétipo que só valem com uma opção do projeto (ex.: iPhone, controle pelo celular). */
const CONDICIONAIS = new Set(["iphone", "celular-experimental", "acima-250g", "ate-250g"]);

const builds = catalog.arquetipos.flatMap((archetype) =>
  solve({ archetype, catalog, config }).faixas.map((plano) => {
    const report = buildProjectReport(plano.build, archetype, catalog, config);
    const guia = buildGuide({
      passos: report.passos,
      build: plano.build,
      parametros: report.parametros,
      alertas: report.alertas,
      ferramentas: toolsForBuild(plano.build, archetype, catalog).map((t) => ({
        id: t.id,
        nome: t.nome,
      })),
    });
    return { nome: `${archetype.id} ${plano.faixa}`, report, guia };
  }),
);

describe("guia dos builds de referência", () => {
  it("são 9 builds", () => {
    expect(builds).toHaveLength(9);
  });

  it.each(builds.map((b) => [b.nome, b] as const))(
    "%s: tudo o que os passos citam existe",
    (_, b) => {
      const problemas: string[] = [];
      for (const p of b.guia) {
        for (const id of p.ferramentas)
          if (!p.ferramentas_do_passo.some((t) => t.id === id))
            problemas.push(`${p.id}: ferramenta ${id}`);
        for (const id of p.alertas)
          if (!p.alertas_do_passo.some((a) => a.id === id) && !CONDICIONAIS.has(id))
            problemas.push(`${p.id}: alerta ${id}`);
        for (const param of p.parametros_do_passo)
          if (param.valor === undefined)
            problemas.push(`${p.id}: parâmetro ${param.nome} sem valor`);
        for (const categoria of p.pecas)
          if (
            !p.pecas_do_build.some((x) =>
              b.report.build.itens.some(
                (i) => i.componente.id === x.id && i.componente.categoria === categoria,
              ),
            )
          )
            problemas.push(`${p.id}: nenhuma peça "${categoria}" no build`);
      }
      expect(problemas).toEqual([]);
    },
  );

  it.each(builds.map((b) => [b.nome, b] as const))("%s: passos críticos têm checklist", (_, b) => {
    const ids = new Set(b.guia.filter((p) => p.checkpoint).map((p) => p.id));
    // SPEC B.9: primeira ligação, hélices e primeiro voo.
    for (const critico of ["primeiro-power-on", "instalar-helices", "primeiro-voo"])
      expect(ids.has(critico), critico).toBe(true);
    // E a primeira ligação vem antes das hélices, que vêm antes do primeiro voo.
    const ordem = b.guia.map((p) => p.id);
    expect(ordem.indexOf("primeiro-power-on")).toBeLessThan(ordem.indexOf("instalar-helices"));
    expect(ordem.indexOf("instalar-helices")).toBeLessThan(ordem.indexOf("primeiro-voo"));
  });

  it.each(builds.map((b) => [b.nome, b] as const))("%s: guia novo começa no passo 1", (_, b) => {
    const estado = guideState(b.guia, []);
    expect(estado.atual).toBe(b.guia[0]?.id);
    expect(estado.feitos).toBe(0);
    expect(estado.obrigatorios).toBeGreaterThanOrEqual(25);
  });
});
