import { describe, expect, it } from "vitest";

import {
  baseBuild,
  parts,
  TEST_ARCHETYPE,
  TEST_FIRMWARE,
  THRUST_TABLE,
  tweak,
} from "./__fixtures__/builds";
import type { Build } from "./build";
import type { DroneCatalog } from "./catalog";
import { validateBuild } from "./compatibility";
import { DEFAULT_DRONE_CONFIG as CONFIG } from "./config";
import { computeCosts } from "./costs";
import type { Archetype, Component } from "./schema";
import {
  type AlternativesInput,
  choiceFromBuild,
  materializeChoice,
  slotAlternatives,
  swapInChoice,
} from "./swap";

/** Slots do build de teste (o TEST_ARCHETYPE só declara o frame). */
const ARCHETYPE: Archetype = {
  ...TEST_ARCHETYPE,
  perfil_firmware: TEST_FIRMWARE.id,
  slots: baseBuild().itens.map((i) => ({
    slot: i.slot,
    categorias: [i.componente.categoria],
    quantidade: i.quantidade_no_drone,
    obrigatorio: i.slot !== "telemetria",
    coberto_por: [],
    compra_por_faixa:
      i.slot === "bateria" ? { economica: 2, equilibrada: 3, premium: 4 } : undefined,
  })),
};

function catalogWith(extra: Component[] = []): DroneCatalog {
  return {
    componentes: [...baseBuild().itens.map((i) => i.componente), ...extra],
    empuxo: [THRUST_TABLE],
    ferramentas: [],
    arquetipos: [ARCHETYPE],
    perfis_firmware: [TEST_FIRMWARE],
    prontos: [],
  };
}

/** Escolha do build de teste com a telemetria Wi-Fi fixa (o build tem o módulo). */
function baseChoice() {
  return choiceFromBuild(baseBuild(), "economica", false);
}

function inputFor(catalog: DroneCatalog): AlternativesInput {
  const choice = baseChoice();
  const montado = materializeChoice(choice, ARCHETYPE, catalog);
  if (!montado.build) throw new Error(montado.descartado);
  const { report, metrics } = validateBuild({
    build: montado.build,
    archetype: ARCHETYPE,
    thrustTables: catalog.empuxo,
    config: CONFIG,
    firmwareProfile: TEST_FIRMWARE,
  });
  return {
    choice,
    archetype: ARCHETYPE,
    catalog,
    config: CONFIG,
    atual: {
      build: montado.build,
      validacao: report,
      metricas: metrics,
      custos: computeCosts(montado.build, ARCHETYPE, catalog),
    },
  };
}

describe("escolha do projeto (o que a pessoa decidiu)", () => {
  it("ida e volta: escolha → build reproduz as mesmas peças e quantidades", () => {
    const build = baseBuild();
    const montado = materializeChoice(baseChoice(), ARCHETYPE, catalogWith());
    expect(montado.descartado).toBeUndefined();
    const resumo = (b: Build) =>
      b.itens.map((i) => [i.slot, i.componente.id, i.quantidade_no_drone, i.quantidade_compra]);
    expect(resumo(montado.build!)).toEqual(resumo(build));
  });

  it("kits não entram na escolha: são recalculados a cada versão", () => {
    const build: Build = {
      ...baseBuild(),
      itens: [
        ...baseBuild().itens,
        { slot: "kit:x", componente: parts.frame(), quantidade_no_drone: 0, quantidade_compra: 1 },
      ],
    };
    expect(choiceFromBuild(build).itens.some((i) => i.slot.startsWith("kit:"))).toBe(false);
  });

  it("trocar mantém as quantidades do slot; adicionar usa a compra da faixa de origem", () => {
    const trocado = swapInChoice(baseChoice(), ARCHETYPE, "bateria", "outra-bateria");
    expect(trocado.itens.find((i) => i.slot === "bateria")).toMatchObject({
      componente_id: "outra-bateria",
      quantidade_no_drone: 1,
      quantidade_compra: 2,
    });
    const semBateria = {
      ...baseChoice(),
      itens: baseChoice().itens.filter((i) => i.slot !== "bateria"),
    };
    const premium = swapInChoice(
      { ...semBateria, faixa_origem: "premium" },
      ARCHETYPE,
      "bateria",
      "outra-bateria",
    );
    expect(premium.itens.find((i) => i.slot === "bateria")?.quantidade_compra).toBe(4);
  });

  it("slot obrigatório não pode ficar vazio; opcional pode", () => {
    expect(() => swapInChoice(baseChoice(), ARCHETYPE, "frame", null)).toThrow(/obrigatório/);
    const sem = swapInChoice(baseChoice(), ARCHETYPE, "telemetria", null);
    expect(sem.itens.some((i) => i.slot === "telemetria")).toBe(false);
  });

  it("peça que saiu do catálogo: usa a cópia guardada na versão e avisa", () => {
    const catalogo = catalogWith();
    const semFc = {
      ...catalogo,
      componentes: catalogo.componentes.filter((c) => c.id !== "fc-teste"),
    };
    expect(materializeChoice(baseChoice(), ARCHETYPE, semFc).descartado).toMatch(/fc-teste/);
    const comCopia = materializeChoice(baseChoice(), ARCHETYPE, semFc, [parts.fc()]);
    expect(comCopia.build).toBeDefined();
    expect(comCopia.faltando).toEqual(["fc-teste"]);
  });

  it("telemetria automática: com rádio e receptor ExpressLRS, o módulo Wi-Fi não faz sentido", () => {
    const automatica = choiceFromBuild(baseBuild(), "economica", true);
    expect(materializeChoice(automatica, ARCHETYPE, catalogWith()).descartado).toMatch(
      /telemetria Wi-Fi/,
    );
    const semModulo = swapInChoice(automatica, ARCHETYPE, "telemetria", null);
    const montado = materializeChoice(semModulo, ARCHETYPE, catalogWith());
    expect(montado.build?.opcoes.telemetria).toBe("elrs_mavlink");
  });
});

describe("alternativas de um slot (trocar peça com revalidação)", () => {
  it("só oferece peças que passam nas regras bloqueantes, com a diferença de custo e peso", () => {
    const escForte = tweak(
      parts.esc(),
      { corrente_continua_a: 40 },
      {
        id: "esc-forte",
        massa_g: 30,
        preco_estimado_brl: { min: 30, max: 40, data: "2026-10-04" },
      },
    );
    const escFraco = tweak(parts.esc(), { corrente_continua_a: 5 }, { id: "esc-fraco" });
    const alt = slotAlternatives(inputFor(catalogWith([escForte, escFraco])), "escs");
    expect(alt.atual?.componente_id).toBe("esc-teste");
    expect(alt.compativeis.map((c) => c.componente_id)).toEqual(["esc-forte"]);
    const forte = alt.compativeis[0]!;
    // 4 ESCs: R$ 10–20 → R$ 30–40 cada.
    expect(forte.delta.custo_pecas).toEqual({ min_centavos: 8000, max_centavos: 8000 });
    // +5 g por ESC, com a margem de 8% de fios e parafusos.
    expect(forte.delta.massa_g).toBeCloseTo(4 * 5 * 1.08, 6);
    expect(forte.delta.twr.depois).toBeLessThan(forte.delta.twr.antes!);
    expect(alt.incompativeis.map((c) => c.componente_id)).toEqual(["esc-fraco"]);
    expect(alt.incompativeis[0]?.motivos.join(" ")).toMatch(/ESC/);
  });

  it("sugere a troca a mais que resolve: frame que pede hélice maior", () => {
    // Frame que só aceita hélice de 12" a 13" e hélice de 12" com a mesma tabela de empuxo.
    const frameGrande = tweak(
      parts.frame(),
      { helice_max_pol: 13, helice_min_pol: 12 },
      { id: "frame-grande" },
    );
    const heliceGrande = tweak(parts.prop(), { diametro_pol: 12 }, { id: "helice-grande" });
    const catalogo = catalogWith([frameGrande, heliceGrande]);
    const tabela = { ...THRUST_TABLE, id: "empuxo-grande", helice_id: "helice-grande" };
    const alt = slotAlternatives(
      inputFor({ ...catalogo, empuxo: [THRUST_TABLE, tabela] }),
      "frame",
    );
    const candidato = alt.incompativeis.find((c) => c.componente_id === "frame-grande");
    expect(candidato?.compativel).toBe(false);
    expect(candidato?.sugestao?.trocas).toEqual([
      {
        slot: "helices",
        rotulo: "Helices",
        componente_id: "helice-grande",
        nome: "Teste Sintético",
      },
    ]);
    expect(candidato?.sugestao?.avaliacao).toMatchObject({ compativel: true, incompleto: false });
  });

  it("tirar a peça de um slot opcional aparece como alternativa", () => {
    const alt = slotAlternatives(inputFor(catalogWith()), "telemetria");
    expect(alt.opcional).toBe(true);
    const sem = [...alt.compativeis, ...alt.incompativeis].find((c) => c.componente_id === null);
    expect(sem?.nome).toBe("Sem esta peça");
  });
});
