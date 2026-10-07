import { describe, expect, it } from "vitest";

import {
  ARCHETYPE_IDS,
  applyAnswers,
  assumptions,
  buildOptionsFor,
  chooseArchetype,
  MAX_QUESTIONS,
  pendingQuestions,
} from "./choose";
import { acceptExplanation, hasDigits } from "./explain";
import { heuristicIntent, parseNumberPt } from "./heuristic";
import { EMPTY_INTENT, sanitizeIntent } from "./intent";
import { budgetFit } from "./plan";
import { normalizeText, prefilterRequest } from "./safety-filter";

describe("pré-filtro de segurança (SPEC B.9, camada 1)", () => {
  it.each([
    ["drone que solte objetos em pessoas", "armas"],
    ["quero jogar uma bomba com o drone", "armas"],
    ["drone para atirar com chumbinho", "armas"],
    ["drone para pulverizar veneno na plantação", "quimicos"],
    ["como espalhar agrotóxico com drone", "quimicos"],
    ["como fazer um bloqueador de drones", "interferencia"],
    ["quero desativar o geofence do drone", "interferencia"],
    ["drone com câmera para vigiar minha vizinha", "vigilancia"],
    ["filmar a minha ex sem ela saber", "vigilancia"],
    ["drone invisível para a polícia não detectar", "ocultacao"],
    ["tirar a identificação da ANAC do drone", "ocultacao"],
  ])("bloqueia %j (%s)", (pedido, categoria) => {
    const r = prefilterRequest(pedido);
    expect(r.bloqueado).toBe(true);
    if (r.bloqueado) {
      expect(r.recusa.categoria).toBe(categoria);
      expect(r.recusa.explicacao.length).toBeGreaterThan(40);
    }
  });

  it.each([
    "drone para filmar a plantação de cima",
    "drone que me siga para eu filmar minhas trilhas",
    "projetei um drone e quero montar",
    "drone armado e pronto para voar: o que conferir?",
    "drone com bomba de água para irrigar? não, só quero filmar a horta",
    "quero soltar a pipa e filmar com o drone",
    "quero lançar meu projeto de drone ainda este mês",
    "drone com uma armação de carbono",
    "drone pra filmar casamentos",
    "drone que voe 10 km longe de mim",
  ])("não bloqueia pedido legítimo %j", (pedido) => {
    expect(prefilterRequest(pedido).bloqueado).toBe(false);
  });

  it("normaliza acentos e maiúsculas", () => {
    expect(normalizeText("  Pulverizar  AGROTÓXICO ")).toBe("pulverizar agrotoxico");
  });
});

describe("modo simples (palavras-chave)", () => {
  it.each([
    ["2.000", false, 2000],
    ["1,5", false, 1.5],
    ["3", true, 3000],
    ["uma", false, 1],
    ["meia", false, 0.5],
    ["abc", false, undefined],
  ] as const)("parseNumberPt(%j, mil=%s) = %s", (raw, mil, esperado) => {
    expect(parseNumberPt(raw, mil)).toBe(esperado);
  });

  it("lê orçamento, autonomia, alcance, carga e peso", () => {
    expect(heuristicIntent("drone até R$ 2.000").orcamento_max_brl).toBe(2000);
    expect(heuristicIntent("tenho 3 mil reais para gastar").orcamento_max_brl).toBe(3000);
    expect(heuristicIntent("drone com 1 hora de voo").autonomia_min_desejada).toBe(60);
    expect(heuristicIntent("drone com bateria de 30 minutos").autonomia_min_desejada).toBe(30);
    expect(heuristicIntent("drone que voe 10 km longe de mim").alcance_m_desejado).toBe(10000);
    const carga = heuristicIntent("drone que carregue 20 kg por R$ 500");
    expect(carga.finalidade).toBe("carga");
    expect(carga.carga_kg).toBe(20);
    expect(carga.orcamento_max_brl).toBe(500);
    expect(heuristicIntent("drone sub-250 para viajar").limite_peso_g).toBe(250);
    expect(heuristicIntent("drone com menos de 250 g").limite_peso_g).toBe(250);
  });

  it("não confunde números sem contexto", () => {
    // "5 polegadas" não é autonomia nem alcance; "2 baterias" não é orçamento.
    const i = heuristicIntent("drone de 5 polegadas com 2 baterias");
    expect(i.autonomia_min_desejada).toBeNull();
    expect(i.alcance_m_desejado).toBeNull();
    expect(i.orcamento_max_brl).toBeNull();
  });

  it("finalidade, ambiente e recursos", () => {
    const a = heuristicIntent("quero um drone pequeno pra voar dentro de casa e aprender");
    expect(a).toMatchObject({ finalidade: "aprender", ambiente: "dentro_de_casa", pequeno: true });
    const b = heuristicIntent(
      "drone simples com GPS, retorno automático, câmera ao vivo e que eu controle pelo celular",
    );
    expect(b).toMatchObject({
      gps: true,
      retorno_automatico: true,
      controle_pelo_celular: true,
      camera: "ao_vivo",
      celular: "desconhecido",
    });
    const c = heuristicIntent("drone pra filmar casamentos");
    expect(c).toMatchObject({ finalidade: "filmar", uso_comercial: true, perto_de_pessoas: true });
    expect(heuristicIntent("drone de corrida bem rápido")).toMatchObject({
      finalidade: "corrida",
      quer_velocidade: true,
    });
  });

  it("sanitizeIntent descarta valores impossíveis", () => {
    const i = sanitizeIntent({
      ...EMPTY_INTENT,
      orcamento_max_brl: -5,
      autonomia_min_desejada: Number.NaN,
      carga_kg: 0,
      limite_peso_g: 250,
      observacoes: ["  ", "prazo de um mês"],
    });
    expect(i.orcamento_max_brl).toBeNull();
    expect(i.autonomia_min_desejada).toBeNull();
    expect(i.carga_kg).toBeNull();
    expect(i.limite_peso_g).toBe(250);
    expect(i.observacoes).toEqual(["prazo de um mês"]);
  });
});

describe("escolha do arquétipo e perguntas (SPEC B.10, passos 3 e 4)", () => {
  it("dentro de casa ou até 250 g → Tiny Whoop", () => {
    const r = chooseArchetype({ ...EMPTY_INTENT, ambiente: "dentro_de_casa", gps: true });
    expect(r).toMatchObject({ tipo: "arquetipo", id: ARCHETYPE_IDS.whoop });
    // GPS não funciona dentro de casa: a explicação diz isso.
    if (r.tipo === "arquetipo") expect(r.motivos.join(" ")).toContain("GPS");
    expect(chooseArchetype({ ...EMPTY_INTENT, limite_peso_g: 250 })).toMatchObject({
      id: ARCHETYPE_IDS.whoop,
    });
  });

  it('corrida, freestyle ou velocidade → FPV 5"', () => {
    for (const finalidade of ["corrida", "freestyle"] as const) {
      expect(chooseArchetype({ ...EMPTY_INTENT, finalidade })).toMatchObject({
        id: ARCHETYPE_IDS.fpv,
      });
    }
    expect(chooseArchetype({ ...EMPTY_INTENT, quer_velocidade: true })).toMatchObject({
      id: ARCHETYPE_IDS.fpv,
    });
  });

  it("filmar, GPS, retorno ou celular → Arquétipo 1", () => {
    expect(chooseArchetype({ ...EMPTY_INTENT, finalidade: "filmar" })).toMatchObject({
      id: ARCHETYPE_IDS.gps,
    });
    expect(chooseArchetype({ ...EMPTY_INTENT, retorno_automatico: true })).toMatchObject({
      id: ARCHETYPE_IDS.gps,
    });
  });

  it("carga → nenhum arquétipo (o motor mostra os números)", () => {
    expect(chooseArchetype({ ...EMPTY_INTENT, carga_kg: 5 })).toEqual({ tipo: "carga" });
  });

  it("sem informação → indefinido, com no máximo 5 perguntas clicáveis", () => {
    const escolha = chooseArchetype(EMPTY_INTENT);
    expect(escolha.tipo).toBe("indefinido");
    const perguntas = pendingQuestions(EMPTY_INTENT, escolha, {});
    expect(perguntas.map((p) => p.id)).toEqual(["objetivo", "onde", "orcamento"]);
    expect(perguntas.length).toBeLessThanOrEqual(MAX_QUESTIONS);
    for (const p of perguntas) expect(p.opcoes.length).toBeGreaterThanOrEqual(2);
  });

  it("as respostas entram na intenção e definem o arquétipo", () => {
    const i = applyAnswers(EMPTY_INTENT, {
      objetivo: "aprender",
      onde: "dentro_de_casa",
      orcamento: "1000",
    });
    expect(i).toMatchObject({
      finalidade: "aprender",
      ambiente: "dentro_de_casa",
      orcamento_max_brl: 1000,
    });
    expect(chooseArchetype(i)).toMatchObject({ id: ARCHETYPE_IDS.whoop });
    // "Ainda não sei" não vira número.
    expect(applyAnswers(EMPTY_INTENT, { orcamento: "sem_limite" }).orcamento_max_brl).toBeNull();
  });

  it("celular no Arquétipo 1: pergunta controle e Android/iPhone; rádio é o padrão", () => {
    const i = { ...EMPTY_INTENT, gps: true, controle_pelo_celular: true };
    const escolha = chooseArchetype(i);
    expect(pendingQuestions(i, escolha, {}).map((p) => p.id)).toEqual(["controle", "celular"]);
    expect(buildOptionsFor(i, ARCHETYPE_IDS.gps, { controle: "radio" })).toEqual({});
    expect(
      buildOptionsFor(applyAnswers(i, { celular: "ios" }), ARCHETYPE_IDS.gps, {
        controle: "celular_experimental",
        celular: "ios",
      }),
    ).toEqual({ controle: "celular_experimental", celular: "ios" });
    // A telemetria nunca vem do pedido: o solver escolhe pelo ADR-0017.
    expect(buildOptionsFor({ ...i, uso_comercial: true }, ARCHETYPE_IDS.gps, {})).toEqual({
      uso: "nao_recreativo",
    });
  });

  it("as suposições dizem o que foi assumido", () => {
    const s = assumptions(EMPTY_INTENT, ARCHETYPE_IDS.gps, {});
    expect(s.join(" ")).toContain("orçamento");
    expect(s.join(" ")).toContain("Android");
    expect(s.join(" ")).toContain("rádio");
  });
});

describe("orçamento e explicação", () => {
  const faixa = (min: number, max: number) => ({
    min_centavos: min * 100,
    max_centavos: max * 100,
    status: "estimativa" as const,
  });

  it("budgetFit: cabe, pode caber, acima", () => {
    expect(budgetFit(faixa(1000, 2000), 2000)).toBe("cabe");
    expect(budgetFit(faixa(1500, 2500), 2000)).toBe("pode_caber");
    expect(budgetFit(faixa(2001, 3000), 2000)).toBe("acima");
  });

  it("a explicação do LLM só passa sem nenhum número", () => {
    const motivos = ["Motivo das regras."];
    expect(acceptExplanation(["Ele é estável e fácil de pilotar."], motivos)).toEqual({
      paragrafos: ["Ele é estável e fácil de pilotar."],
      origem: "ia",
    });
    expect(acceptExplanation(["Voa 12 minutos."], motivos).origem).toBe("regras");
    // Algarismos de outros alfabetos também contam.
    expect(hasDigits("voa ٣ minutos")).toBe(true);
    expect(acceptExplanation([], motivos).origem).toBe("regras");
    expect(acceptExplanation(["a", "b", "c", "d", "e"], motivos).origem).toBe("regras");
    expect(acceptExplanation(["x".repeat(701)], motivos).origem).toBe("regras");
  });
});
