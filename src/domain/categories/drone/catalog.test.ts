import { describe, expect, it } from "vitest";

import {
  makeComponent,
  parts,
  TEST_ARCHETYPE,
  TEST_FIRMWARE,
  THRUST_TABLE,
  tweak,
} from "./__fixtures__/builds";
import { checkCatalog, COMPONENT_CATEGORIES, type DroneCatalog } from "./catalog";
import { toolSchema } from "./schema";

const TOOL = toolSchema.parse({
  id: "ferro-de-solda",
  nome: "Ferro de solda",
  tipo: "ferramenta",
  prioridade: "essencial",
  para_que_serve: "Soldar fios.",
  por_que_necessaria: "Motores e bateria são ligados com solda.",
  preco_estimado_brl: { min: 120, max: 450, data: "2026-10-04" },
  onde_comprar: [{ tipo_loja: "loja_ferramentas", termo_busca: "ferro de solda temperatura" }],
});

const STEP = {
  id: "soldar-motores",
  titulo: "Soldar os motores",
  objetivo: "Ligar os motores ao ESC.",
  por_que_importa: "Solda ruim solta em voo.",
  pecas: ["motor", "esc"],
  ferramentas: ["ferro-de-solda"],
  tempo_min: [30, 60] as [number, number],
  dominios: { eletronica_solda: 2 as const },
  riscos: [],
  como_saber_que_deu_certo: ["Solda brilhante e firme."],
  erros_comuns: [],
  local: "em_casa" as const,
  alertas: [],
  variaveis: [],
  opcional: false,
  fontes: [],
};

function catalog(over: Partial<DroneCatalog> = {}): DroneCatalog {
  return {
    componentes: [parts.motor(), parts.prop(), parts.frame()],
    empuxo: [THRUST_TABLE],
    ferramentas: [TOOL],
    arquetipos: [{ ...TEST_ARCHETYPE, perfil_firmware: TEST_FIRMWARE.id, passos: [STEP] }],
    perfis_firmware: [TEST_FIRMWARE],
    prontos: [],
    ...over,
  };
}

describe("checkCatalog", () => {
  it("catálogo coerente não tem problemas", () => {
    expect(checkCatalog(catalog())).toEqual([]);
  });

  it("bateria sem química é problema (define a tensão de carga e ajustes do firmware)", () => {
    const base = [parts.motor(), parts.prop(), parts.frame()];
    const semQuimica = tweak(parts.battery(), { quimica: undefined });
    expect(checkCatalog(catalog({ componentes: [...base, semQuimica] }))).toEqual([
      `componente ${semQuimica.id}: bateria sem química (LiPo, LiHV ou Li-ion)`,
    ]);
    expect(checkCatalog(catalog({ componentes: [...base, parts.battery()] }))).toEqual([]);
  });

  it("conhece todas as categorias do schema", () => {
    expect(COMPONENT_CATEGORIES.has("fc_aio")).toBe(true);
    expect(COMPONENT_CATEGORIES.size).toBeGreaterThan(25);
  });

  it("acusa ids repetidos", () => {
    const problemas = checkCatalog(
      catalog({ componentes: [parts.motor(), parts.motor(), parts.prop()] }),
    );
    expect(problemas).toContain("componente com id repetido: motor-teste");
  });

  it("tabela de empuxo precisa apontar para motor e hélice que existem", () => {
    const problemas = checkCatalog(catalog({ componentes: [parts.frame()] }));
    expect(problemas.some((p) => p.includes('motor_id "motor-teste" não existe'))).toBe(true);
    expect(problemas.some((p) => p.includes('helice_id "helice-teste" não existe'))).toBe(true);
  });

  it("tabela de empuxo em que mais acelerador dá menos empuxo é erro", () => {
    const ruim = {
      ...THRUST_TABLE,
      pontos: [
        { throttle_pct: 50, empuxo_g: 300, corrente_a: 3 },
        { throttle_pct: 100, empuxo_g: 250, corrente_a: 11 },
      ],
    };
    expect(checkCatalog(catalog({ empuxo: [ruim] })).join(" ")).toContain("diminui");
  });

  it("tabela com número de células fora da faixa do motor", () => {
    expect(
      checkCatalog(catalog({ empuxo: [{ ...THRUST_TABLE, celulas: 6 }] })).join(" "),
    ).toContain("fora da faixa");
  });

  it("selo ✅ exige fonte com link e data de acesso", () => {
    const semFonte = tweak(parts.motor(), {}, { status_verificacao: "verificado" });
    const comFonte = tweak(
      parts.motor(),
      {},
      {
        status_verificacao: "verificado",
        fontes: [
          {
            titulo: "Datasheet",
            tipo: "datasheet",
            url: "https://exemplo.com/motor.pdf",
            acessado_em: "2026-10-04",
          },
        ],
      },
    );
    expect(checkCatalog(catalog({ componentes: [semFonte, parts.prop()] })).join(" ")).toContain(
      "verificado sem fonte",
    );
    expect(checkCatalog(catalog({ componentes: [comFonte, parts.prop()] }))).toEqual([]);
  });

  it("onde comprar não aceita link de anúncio", () => {
    const comLink = tweak(
      parts.prop(),
      {},
      {
        onde_comprar: [
          { tipo_loja: "marketplace_nacional", termo_busca: "https://loja.com/anuncio/123" },
        ],
      },
    );
    expect(checkCatalog(catalog({ componentes: [parts.motor(), comLink] })).join(" ")).toContain(
      "parece um link",
    );
  });

  it("o que vem na caixa precisa existir; peça só de kit não precisa de preço", () => {
    const motorDoKit = tweak(
      parts.motor(),
      {},
      { vendido_separadamente: false, preco_estimado_brl: undefined },
    );
    const kit = makeComponent({
      categoria: "kit",
      id: "kit-teste",
      specs: {},
      inclui: [
        { componente_id: "motor-teste", quantidade: 4 },
        { componente_id: "fantasma", quantidade: 1 },
      ],
    });
    const problemas = checkCatalog(catalog({ componentes: [motorDoKit, parts.prop(), kit] }));
    expect(problemas).toEqual(['componente kit-teste: inclui "fantasma", que não existe']);
  });

  it("peça que não é vendida separadamente precisa vir na caixa de algum produto", () => {
    const sozinha = tweak(parts.motor(), {}, { vendido_separadamente: false });
    expect(checkCatalog(catalog({ componentes: [sozinha, parts.prop()] })).join(" ")).toContain(
      "nenhum produto o inclui",
    );
  });

  it("passos só citam ferramentas, categorias e alertas que existem", () => {
    const passo = {
      ...STEP,
      ferramentas: ["chave-inexistente"],
      pecas: ["foguete"],
      alertas: ["alerta-inexistente"],
    };
    const problemas = checkCatalog(
      catalog({ arquetipos: [{ ...TEST_ARCHETYPE, passos: [passo] }] }),
    ).join(" ");
    expect(problemas).toContain('ferramenta "chave-inexistente"');
    expect(problemas).toContain('categoria "foguete"');
    expect(problemas).toContain('alerta "alerta-inexistente"');
  });

  it("alertas globais contam como existentes", () => {
    const passo = { ...STEP, alertas: ["lipo"] };
    const cat = catalog({ arquetipos: [{ ...TEST_ARCHETYPE, passos: [passo] }] });
    expect(checkCatalog(cat)).not.toEqual([]);
    expect(checkCatalog(cat, { alertasGlobais: ["lipo"] })).toEqual([]);
  });

  it("arquétipo precisa apontar para um perfil de firmware que existe", () => {
    const cat = catalog({ perfis_firmware: [] });
    expect(checkCatalog(cat).join(" ")).toContain("perfil de firmware");
  });
});
