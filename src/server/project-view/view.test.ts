import { describe, expect, it } from "vitest";

import { applySwaps, choiceFromBuild } from "@/domain/categories/drone/swap";
import { loadDroneCatalog } from "@/server/catalog/load";

import {
  projectStatus,
  type ProjectViewData,
  referenceBuild,
  referenceProjectView,
  savedProjectView,
  snapshotFor,
} from "./view";

/*
 * Aceite da Fase 3 no servidor: abrir um build de referência e ter custos, dificuldade, locais,
 * alertas e cálculos; trocar uma peça e ver tudo recalculado.
 */

const loaded = loadDroneCatalog();

function view(arquetipo: string, faixa: "economica" | "equilibrada" | "premium") {
  const v = referenceProjectView(arquetipo, faixa, { loaded });
  if (!v) throw new Error(`${arquetipo} ${faixa} sem build`);
  return v;
}

describe("página de um build de referência", () => {
  it("os 9 builds têm tudo o que as 6 abas mostram", () => {
    for (const a of loaded.catalog.arquetipos) {
      for (const faixa of ["economica", "equilibrada", "premium"] as const) {
        const v: ProjectViewData = view(a.id, faixa);
        const onde = `${a.id} ${faixa}`;
        expect(v.status.tipo, onde).toBe("compativel");
        expect(v.bom.length, onde).toBeGreaterThanOrEqual(4);
        expect(v.relatorio.custos.total.max_centavos, onde).toBeGreaterThan(0);
        expect(v.relatorio.dificuldade.dominios.length, onde).toBeGreaterThanOrEqual(5);
        expect(
          v.relatorio.locais.some((l) => l.local === "espaco_aberto"),
          onde,
        ).toBe(true);
        expect(
          v.relatorio.alertas.some((x) => x.id === "lipo"),
          onde,
        ).toBe(true);
        expect(v.relatorio.validacao.resultados.length, onde).toBeGreaterThan(20);
        expect(v.ferramentas.length, onde).toBeGreaterThan(5);
        expect(Object.keys(v.partes).length, onde).toBeGreaterThan(5);
        expect(
          v.alternativas.some((s) => s.compativeis.length > 0),
          onde,
        ).toBe(true);
        // Tudo vai para a página como JSON: nada de Date, Map ou função.
        expect(JSON.parse(JSON.stringify(v)), onde).toEqual(v);
      }
    }
  });

  it('só o Arquétipo 1 mostra a comparação 450 mm × 5"', () => {
    expect(view("a1-gps-filmagem", "economica").comparacao_tamanho?.escolha).toMatch(/450/);
    expect(view("a2-fpv-5pol", "economica").comparacao_tamanho).toBeUndefined();
  });

  it("'já tenho' tira a ferramenta do total e ela continua na lista, marcada", () => {
    const sem = view("a1-gps-filmagem", "economica");
    const ferro = sem.ferramentas.find((f) => f.id.includes("ferro"))!;
    const com = referenceProjectView("a1-gps-filmagem", "economica", {
      loaded,
      ferramentasQueTenho: new Set([ferro.id]),
    })!;
    expect(com.ferramentas.find((f) => f.id === ferro.id)?.ja_tenho).toBe(true);
    expect(com.relatorio.custos.total_ferramentas.max_centavos).toBeLessThan(
      sem.relatorio.custos.total_ferramentas.max_centavos,
    );
  });
});

describe("projeto salvo: troca de peça revalidada", () => {
  it("trocar a FC recalcula custo, peso e regras; o catálogo igual não gera aviso", () => {
    const ref = referenceBuild(loaded, "a1-gps-filmagem", "economica")!;
    const escolha = applySwaps(choiceFromBuild(ref.build, "economica"), ref.archetype, [
      { slot: "fc", componente_id: "holybro-pixhawk-6c-plastico" },
    ]);
    const salvo = snapshotFor(escolha, { loaded });
    if ("erro" in salvo) throw new Error(salvo.erro);
    const v = savedProjectView(
      {
        id: "p1",
        titulo: "Meu drone",
        versao: 2,
        versao_atual: 2,
        versoes: [
          { numero: 2, motivo: "Trocou a FC", criado_em: new Date("2026-10-05T11:00:00Z") },
          { numero: 1, motivo: "Referência", criado_em: new Date("2026-10-05T10:00:00Z") },
        ],
        catalogo_hash: loaded.hash,
        escolha,
        pecas: salvo.snapshot.pecas,
      },
      { loaded },
    );
    if ("erro" in v) throw new Error(v.erro);
    const referencia = view("a1-gps-filmagem", "economica");
    expect(v.relatorio.custos.total_pecas.min_centavos).toBeGreaterThan(
      referencia.relatorio.custos.total_pecas.min_centavos,
    );
    expect(v.build.itens.find((i) => i.slot === "fc")?.componente.id).toBe(
      "holybro-pixhawk-6c-plastico",
    );
    expect(v.origem).toMatchObject({
      tipo: "projeto",
      catalogo_mudou: false,
      pecas_fora_do_catalogo: [],
    });
    expect(v.status.tipo).toBe("compativel");
  });

  it("escolha impossível de montar vira erro legível, não exceção", () => {
    const ref = referenceBuild(loaded, "a3-tiny-whoop", "economica")!;
    const escolha = choiceFromBuild(ref.build, "economica");
    const quebrada = {
      ...escolha,
      itens: escolha.itens.map((i) => (i.slot === "fc" ? { ...i, componente_id: "sumiu" } : i)),
    };
    expect(snapshotFor(quebrada, { loaded })).toEqual({
      erro: "Peças que não existem no catálogo: sumiu.",
    });
  });
});

describe("selo do conjunto de regras", () => {
  it("bloqueado quando uma regra bloqueante falha", () => {
    const s = projectStatus({
      resultados: [
        {
          regra_id: "x",
          titulo: "Regra X",
          status: "falhou",
          severidade: "bloqueante",
          selo: "nao_verificado",
          explicacao_leiga: "",
          explicacao_tecnica: "",
        },
      ],
      bloqueado: true,
      incompleto: false,
      contagem: { passou: 0, falhou: 1, sem_dado: 0 },
    });
    expect(s).toMatchObject({ tipo: "bloqueado", titulo: "Não monte assim" });
    expect(s.texto).toMatch(/Regra X/);
  });
});
