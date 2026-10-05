import { describe, expect, it } from "vitest";

import { bomRows, groupBom } from "@/domain/categories/drone/bom";
import { DEFAULT_DRONE_CONFIG } from "@/domain/categories/drone/config";
import { buildProjectReport } from "@/domain/categories/drone/project";
import { solve, TIERS } from "@/domain/categories/drone/solver";
import {
  allSlotAlternatives,
  choiceFromBuild,
  materializeChoice,
  slotAlternatives,
} from "@/domain/categories/drone/swap";
import { loadDroneCatalog } from "@/server/catalog/load";

/*
 * Aceite da Fase 3 (SPEC B.18): "trocar uma peça com revalidação", com o catálogo real.
 * Cada alternativa oferecida é validada pelas mesmas regras do solver; peça que não serve aparece
 * à parte, com o motivo, e quando uma troca a mais resolve, o app sugere a combinação.
 */

const { catalog } = loadDroneCatalog();
const config = DEFAULT_DRONE_CONFIG;

function reference(id: string, faixa: (typeof TIERS)[number]) {
  const archetype = catalog.arquetipos.find((a) => a.id === id);
  if (!archetype) throw new Error(`arquétipo ${id} não está no catálogo`);
  const plano = solve({ archetype, catalog, config }).faixas.find((p) => p.faixa === faixa);
  if (!plano) throw new Error(`${id} ${faixa} sem solução`);
  const atual = buildProjectReport(plano.build, archetype, catalog, config);
  const choice = choiceFromBuild(plano.build, faixa);
  return { archetype, plano, atual, input: { choice, archetype, catalog, config, atual } };
}

describe("projeto salvo como escolha (slot → peça)", () => {
  it("os 9 builds de referência voltam iguais a partir da escolha (kits recalculados)", () => {
    for (const archetype of catalog.arquetipos) {
      for (const plano of solve({ archetype, catalog, config }).faixas) {
        const montado = materializeChoice(choiceFromBuild(plano.build), archetype, catalog);
        const ids = (itens: typeof plano.build.itens) =>
          itens.map((i) => `${i.slot}:${i.componente.id}:${i.fornecido_por ?? ""}`).sort();
        expect(ids(montado.build!.itens), `${archetype.id} ${plano.faixa}`).toEqual(
          ids(plano.build.itens),
        );
        expect(montado.build!.opcoes, `${archetype.id} ${plano.faixa}`).toEqual(plano.build.opcoes);
      }
    }
  });
});

describe("trocar peça com revalidação (catálogo real)", () => {
  it("Arquétipo 1: trocar a FC pela Pixhawk 6C é compatível e mostra quanto custa a mais", () => {
    const { input } = reference("a1-gps-filmagem", "economica");
    const fc = slotAlternatives(input, "fc");
    const pixhawk6c = fc.compativeis.find((c) => c.componente_id === "holybro-pixhawk-6c-plastico");
    expect(pixhawk6c).toBeDefined();
    expect(pixhawk6c?.delta.custo_pecas.min_centavos).toBeGreaterThan(0);
    expect(pixhawk6c?.motivos).toEqual([]);
  });

  it("Arquétipo 1: bateria 6S não serve (motor de 920KV é para 3S–4S) e diz por quê", () => {
    const { input } = reference("a1-gps-filmagem", "economica");
    const bateria = slotAlternatives(input, "bateria");
    expect(bateria.compativeis).toEqual([]);
    const seisS = bateria.incompativeis.find(
      (c) => c.componente_id === "cnhl-ministar-1500-6s-120c",
    );
    expect(seisS?.motivos.join(" | ")).toMatch(/tensão certa para o motor/);
  });

  it("Arquétipo 3: frame de 75 mm não serve sozinho; a sugestão troca hélice e motor juntos", () => {
    const { input } = reference("a3-tiny-whoop", "economica");
    const frame = slotAlternatives(input, "frame");
    const air75 = frame.incompativeis.find((c) => c.componente_id === "betafpv-air75-ii-frame");
    expect(air75?.motivos.join(" ")).toMatch(/hélice/i);
    expect(air75?.sugestao?.trocas.map((t) => t.componente_id).sort()).toEqual([
      "betafpv-0802-2026-freestyle",
      "gemfan-1614-3b",
    ]);
    // Com as três trocas o projeto fica igual ao build equilibrado: completo e sem bloqueio.
    expect(air75?.sugestao?.avaliacao).toMatchObject({ compativel: true, incompleto: false });
  });

  it("toda alternativa compatível passa nas regras bloqueantes (nos 9 builds)", () => {
    for (const archetype of catalog.arquetipos) {
      for (const faixa of TIERS) {
        const { input } = reference(archetype.id, faixa);
        for (const slot of allSlotAlternatives(input)) {
          for (const c of slot.compativeis) {
            expect(c.motivos, `${archetype.id} ${faixa} ${slot.slot} ${c.nome}`).toEqual([]);
          }
          for (const c of slot.incompativeis) {
            expect(
              c.motivos.length,
              `${archetype.id} ${faixa} ${slot.slot} ${c.nome}`,
            ).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe("lista de peças agrupada (aba Peças e Custos)", () => {
  it("Arquétipo 1: o kit X500 aparece com o conteúdo e as peças dele dizem que vêm na caixa", () => {
    const { archetype, plano, atual } = reference("a1-gps-filmagem", "economica");
    const linhas = bomRows(plano.build, archetype, atual.custos);
    const kit = linhas.find((l) => l.componente_id === "holybro-x500-v2-arf");
    expect(kit?.conteudo.length).toBeGreaterThanOrEqual(4);
    const motor = linhas.find((l) => l.categoria === "motor");
    expect(motor?.vem_com?.id).toBe("holybro-x500-v2-arf");
    expect(groupBom(linhas).map((g) => g.grupo)).toEqual([
      "estrutura",
      "propulsao",
      "eletronica",
      "radio_video",
      "energia",
    ]);
    // Todo slot tem nome para leigo vindo do catálogo.
    for (const l of linhas) expect(l.rotulo, l.slot).not.toMatch(/_/);
  });

  it("totais da SPEC B.12: peças, ferramentas, consumíveis, EPI e importação estimada", () => {
    const { atual } = reference("a1-gps-filmagem", "economica");
    const c = atual.custos;
    expect(c.importacao_estimada.min_centavos).toBeGreaterThan(0);
    expect(c.importacao_estimada.max_centavos).toBeLessThan(c.total_pecas.max_centavos);
    for (const tipo of ["ferramenta", "consumivel", "epi"] as const) {
      expect(c.totais_por_tipo[tipo].max_centavos, tipo).toBeGreaterThan(0);
    }
  });
});
