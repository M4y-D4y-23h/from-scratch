import { describe, expect, it } from "vitest";

import { baseBuild, TEST_ARCHETYPE } from "./__fixtures__/builds";
import type { DroneCatalog } from "./catalog";
import { computeCosts } from "./costs";
import { AVISO_PRONTO, compareReadyMade } from "./ready-made";
import type { ReadyMade } from "./schema";

/*
 * Montar × comprar pronto: o pronto + o que ainda falta comprar, comparado com as peças do
 * projeto. No baseBuild cada pacote custa R$ 10–20 (fixtures).
 */

const archetype = { ...TEST_ARCHETYPE, passos: [] };

function pronto(over: Partial<ReadyMade>): ReadyMade {
  return {
    id: "pronto-teste",
    arquetipo_id: archetype.id,
    marca: "Teste",
    modelo: "Pronto",
    tipo: "BNF",
    descricao_leiga: "Drone pronto de teste.",
    cobre_categorias: ["frame", "motor", "esc", "helice", "fc", "receptor"],
    onde_comprar: [{ tipo_loja: "fabricante", termo_busca: "pronto" }],
    fontes: [{ titulo: "Fonte de teste", tipo: "comunidade" }],
    status_verificacao: "nao_verificado",
    diferencas: [],
    notas: [],
    ...over,
  };
}

function compare(prontos: ReadyMade[]) {
  const build = baseBuild();
  const catalog: DroneCatalog = {
    componentes: [],
    empuxo: [],
    ferramentas: [],
    arquetipos: [archetype],
    perfis_firmware: [],
    prontos,
  };
  const custos = computeCosts(build, archetype, catalog);
  return { comparacao: compareReadyMade(build, custos, archetype, catalog), custos };
}

const brl = (min: number, max: number) => ({
  min,
  max,
  data: "2026-10-04",
  status: "estimativa" as const,
  fontes: [],
});

describe("montar × comprar pronto", () => {
  it("BNF: soma o preço com as peças que ele não traz", () => {
    const { comparacao } = compare([pronto({ preco_estimado_brl: brl(50, 60) })]);
    const opcao = comparacao.opcoes[0]!;
    // Não cobre: bateria, conector, rádio, GPS, mastro, telemetria, câmera, VTX, antena,
    // receptor de vídeo (10 peças).
    expect(opcao.complementos).toHaveLength(10);
    expect(opcao.complementos.map((c) => c.id)).toContain("radio-tx-teste");
    expect(opcao.complementos.map((c) => c.id)).not.toContain("frame-teste");
    // Bateria: 2 unidades (1 pacote cada a R$ 10–20) → R$ 20–40; as outras 9: R$ 10–20 cada.
    expect(opcao.total?.min_centavos).toBe(5000 + 2000 + 9 * 1000);
    expect(opcao.total?.max_centavos).toBe(6000 + 4000 + 9 * 2000);
    expect(opcao.baterias).toEqual({ pronto: undefined, projeto: 2 });
  });

  it("veredito: mais barato, mais caro ou parecido, pela faixa inteira", () => {
    const tudo = [
      "frame",
      "motor",
      "esc",
      "helice",
      "fc",
      "bateria",
      "conector",
      "receptor",
      "radio_tx",
      "gps",
      "mastro_gps",
      "telemetria",
      "camera_fpv",
      "vtx",
      "antena",
      "receptor_video",
    ];
    // Peças do projeto: 30 pacotes a R$ 10–20 (8 de hélice, 4 de motor, 4 de ESC, 2 de bateria e
    // 1 de cada uma das outras 12 peças) = R$ 300 a R$ 600.
    const { comparacao: barato } = compare([
      pronto({ cobre_categorias: tudo, preco_estimado_brl: brl(100, 160) }),
    ]);
    expect(barato.opcoes[0]?.veredito).toBe("pronto_mais_barato");
    const { comparacao: caro } = compare([
      pronto({ cobre_categorias: tudo, preco_estimado_brl: brl(700, 800) }),
    ]);
    expect(caro.opcoes[0]?.veredito).toBe("montar_mais_barato");
    const { comparacao: parecido } = compare([
      pronto({ cobre_categorias: tudo, preco_estimado_brl: brl(400, 500) }),
    ]);
    expect(parecido.opcoes[0]?.veredito).toBe("parecido");
  });

  it("sem preço não arrisca veredito; prontos de outro arquétipo ficam de fora", () => {
    const { comparacao } = compare([
      pronto({ id: "sem-preco" }),
      pronto({ id: "outro", arquetipo_id: "a3-tiny-whoop", preco_estimado_brl: brl(1, 2) }),
    ]);
    expect(comparacao.opcoes.map((o) => o.id)).toEqual(["sem-preco"]);
    expect(comparacao.opcoes[0]?.veredito).toBe("sem_preco");
  });

  it("sempre traz o aviso de que o pronto pode sair mais barato, com fonte", () => {
    const { comparacao, custos } = compare([]);
    expect(comparacao.aviso).toBe(AVISO_PRONTO);
    expect(comparacao.fonte.url).toContain("ardupilot.org");
    expect(comparacao.montar_pecas).toEqual(custos.total_pecas);
  });
});
