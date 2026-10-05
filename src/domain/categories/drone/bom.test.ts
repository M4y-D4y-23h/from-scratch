import { describe, expect, it } from "vitest";

import { baseBuild, item, makeComponent, parts, TEST_ARCHETYPE } from "./__fixtures__/builds";
import { bomRows, groupBom, purchaseOptions, slotLabel } from "./bom";
import type { Build } from "./build";
import type { DroneCatalog } from "./catalog";
import { computeCosts } from "./costs";

const ARCHETYPE = {
  ...TEST_ARCHETYPE,
  slots: [
    ...TEST_ARCHETYPE.slots.map((s) => ({ ...s, rotulo: "Frame (estrutura)" })),
    { slot: "motores", categorias: ["motor"], quantidade: 4, obrigatorio: true, coberto_por: [] },
  ],
};

const catalogOf = (build: Build): DroneCatalog => ({
  componentes: build.itens.map((i) => i.componente),
  empuxo: [],
  ferramentas: [],
  arquetipos: [ARCHETYPE],
  perfis_firmware: [],
  prontos: [],
});

describe("lista de peças (BOM)", () => {
  it("agrupa por função na ordem da SPEC: estrutura, propulsão, eletrônica, rádio/vídeo, energia", () => {
    const build = baseBuild();
    const rows = bomRows(build, ARCHETYPE, computeCosts(build, ARCHETYPE, catalogOf(build)));
    const grupos = groupBom(rows).map((g) => g.rotulo);
    expect(grupos).toEqual(["Estrutura", "Propulsão", "Eletrônica", "Rádio e vídeo", "Energia"]);
    const propulsao = groupBom(rows).find((g) => g.grupo === "propulsao");
    expect(propulsao?.linhas.map((l) => l.categoria).sort()).toEqual(["esc", "helice", "motor"]);
  });

  it("usa o rótulo do slot do catálogo e cai no id legível quando não há", () => {
    expect(slotLabel(ARCHETYPE, "frame")).toBe("Frame (estrutura)");
    expect(slotLabel(ARCHETYPE, "receptor_video")).toBe("Receptor video");
    expect(slotLabel(ARCHETYPE, "kit:x500")).toBe("Kit");
  });

  it("kit: mostra o conteúdo; peça do kit diz em que caixa vem e não tem custo próprio", () => {
    const motor = parts.motor();
    const kit = makeComponent({
      categoria: "kit",
      id: "kit-arf",
      specs: {},
      inclui: [{ componente_id: motor.id, quantidade: 4 }],
    });
    const build: Build = {
      ...baseBuild(),
      itens: [
        { ...item("motores", motor, 4), fornecido_por: kit.id },
        item("kit:kit-arf", kit, 0, 1),
      ],
    };
    const rows = bomRows(build, ARCHETYPE, computeCosts(build, ARCHETYPE, catalogOf(build)));
    const linhaKit = rows.find((r) => r.componente_id === "kit-arf");
    expect(linhaKit?.conteudo).toEqual([{ id: motor.id, nome: "Teste Sintético", quantidade: 4 }]);
    expect(linhaKit?.voa).toBe(false);
    const linhaMotor = rows.find((r) => r.componente_id === motor.id);
    expect(linhaMotor?.vem_com).toEqual({ id: "kit-arf", nome: "Teste Sintético" });
    expect(linhaMotor?.custo?.origem).toBe("incluido");
    expect(linhaMotor?.voa).toBe(true);
  });

  it("onde comprar: busca no Mercado Livre e no AliExpress; loja de hobby só como tipo", () => {
    const opcoes = purchaseOptions([
      { tipo_loja: "marketplace_nacional", termo_busca: "motor 2207" },
      { tipo_loja: "importacao", termo_busca: "motor 2207" },
      { tipo_loja: "loja_hobby_robotica", termo_busca: "motor 2207" },
      { tipo_loja: "fabricante", termo_busca: "iFlight XING2" },
    ]);
    expect(opcoes.map((o) => o.links.map((l) => l.site))).toEqual([
      ["mercado_livre"],
      ["aliexpress"],
      [],
      [],
    ]);
    expect(opcoes[2]).toMatchObject({
      rotulo: "lojas de hobby e robótica",
      termo_busca: "motor 2207",
    });
  });
});
