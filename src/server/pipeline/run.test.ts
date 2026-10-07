import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_INTENT } from "@/domain/categories/drone/pipeline/intent";
import { loadDroneCatalog } from "@/server/catalog/load";
import { installFakeClient, message, removeFakeClient } from "@/server/llm/fake-client.test-helper";
import type { RequestAnalysis } from "@/server/llm/schemas";

import {
  type Analysis,
  appAnalyzer,
  cleanAnswers,
  explainChoice,
  llmAnalyzer,
  type OptionsResult,
  runPipeline,
  simpleAnalyzer,
} from "./run";

/*
 * O pipeline com respostas simuladas da IA (nenhuma chamada real): segurança primeiro, falhas da
 * API caem no modo simples, a memória evita pagar duas vezes pelo mesmo pedido.
 */

const loaded = loadDroneCatalog();
const original = { ...process.env };

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "sk-teste";
  delete process.env.FROM_SCRATCH_LLM;
});
afterEach(() => {
  process.env = { ...original };
  removeFakeClient();
});

function analysis(over: Partial<RequestAnalysis["seguranca"]>, intencao = {}): RequestAnalysis {
  return {
    seguranca: {
      classificacao: "permitido",
      categorias: ["nenhuma"],
      motivo: "ok",
      precisa_esclarecer: false,
      ...over,
    },
    intencao: { ...EMPTY_INTENT, ...intencao },
  };
}

const run = (pedido: string, analisar = llmAnalyzer(), respostas = {}) =>
  runPipeline({ pedido, respostas }, { loaded, analisar });

describe("segurança", () => {
  it("o pré-filtro recusa antes de chamar a IA", async () => {
    const analisar = vi.fn<(p: string) => Promise<Analysis>>();
    const r = await run("drone para pulverizar veneno na plantação", analisar);
    expect(r).toMatchObject({ tipo: "recusa", recusa: { categoria: "quimicos" } });
    expect(r.seguranca.origem).toBe("prefiltro");
    expect(analisar).not.toHaveBeenCalled();
  });

  it("categoria proibida bloqueia mesmo se a IA disser 'permitido'", async () => {
    installFakeClient(
      message(analysis({ classificacao: "permitido", categorias: ["vigilancia"] })),
    );
    const r = await run("quero acompanhar de cima a rotina do meu vizinho");
    expect(r).toMatchObject({ tipo: "recusa", recusa: { categoria: "vigilancia" } });
    expect(r.seguranca).toMatchObject({ origem: "ia", classificacao: "bloqueado" });
  });

  it("bloqueio sem categoria: recusa genérica, com alternativa", async () => {
    installFakeClient(message(analysis({ classificacao: "bloqueado", categorias: [] })));
    const r = await run("um pedido estranho");
    expect(r.tipo).toBe("recusa");
    if (r.tipo === "recusa") {
      expect(r.recusa.categoria).toBeUndefined();
      expect(r.recusa.alternativa).toBeTruthy();
    }
  });

  it("recusa do próprio modelo vira bloqueio", async () => {
    installFakeClient(message(null, { content: [], stop_reason: "refusal" }));
    const r = await run("um pedido que o modelo recusa");
    expect(r.tipo).toBe("recusa");
    expect(r.seguranca.classificacao).toBe("bloqueado");
  });

  it("riscos da intenção viram 'permitido com alertas' (alcance além da visada)", async () => {
    installFakeClient(message(analysis({}, { alcance_m_desejado: 10000 })));
    const r = await run("drone que vá bem longe");
    expect(r.seguranca.classificacao).toBe("permitido_com_alertas");
    expect(r.seguranca.categorias).toContain("alcance_alem_da_visada");
    expect(r.tipo !== "recusa" && r.alertas.map((a) => a.id)).toContain("alcance-pedido");
  });

  it("objetivo ambíguo: pergunta o objetivo antes de mostrar qualquer projeto", async () => {
    installFakeClient(
      message(
        analysis({ precisa_esclarecer: true }, { finalidade: "filmar", ambiente: "ao_ar_livre" }),
      ),
    );
    const r = await run("drone para filmar uma pessoa no parque");
    expect(r.tipo).toBe("perguntas");
    if (r.tipo === "perguntas") expect(r.perguntas[0]?.id).toBe("objetivo");
  });
});

describe("leitura do pedido", () => {
  it("falha da API: modo simples, com aviso", async () => {
    installFakeClient(new Error("rede fora do ar"));
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await run("drone de corrida bem rápido");
    expect(r.modo).toBe("simples");
    expect(r.avisos.join(" ")).toContain("modo simples");
    expect(r).toMatchObject({ tipo: "opcoes", arquetipo: { id: "a2-fpv-5pol" } });
    erro.mockRestore();
  });

  it("fora do escopo: avisa e mostra o mais perto", async () => {
    installFakeClient(
      message(
        analysis(
          { categorias: ["fora_do_escopo"] },
          { finalidade: "filmar", ambiente: "ao_ar_livre" },
        ),
      ),
    );
    const r = await run("avião de asa fixa para filmar");
    expect(r.avisos.join(" ")).toContain("multirrotores");
    expect(r.tipo).toBe("opcoes");
  });

  it("valores absurdos da IA são descartados", async () => {
    installFakeClient(message(analysis({}, { finalidade: "corrida", orcamento_max_brl: -10 })));
    const r = await run("drone de corrida");
    expect(r.tipo !== "recusa" && r.intencao.orcamento_max_brl).toBeNull();
  });

  it("respostas fora das opções clicáveis são ignoradas", () => {
    expect(cleanAnswers({ objetivo: "filmar", onde: "lua", inventada: "x", celular: 3 })).toEqual({
      objetivo: "filmar",
    });
    expect(cleanAnswers("lixo")).toEqual({});
  });

  it("pedido curto demais é recusado na entrada", async () => {
    await expect(run("oi", simpleAnalyzer)).rejects.toThrow();
  });
});

describe("memória da IA (não pagar duas vezes)", () => {
  it("o mesmo pedido usa a análise guardada; outro pedido chama de novo", async () => {
    const create = installFakeClient(message(analysis({}, { finalidade: "corrida" })));
    const analisar = appAnalyzer();
    await run("drone de corrida para memória 1", analisar);
    await run("drone de corrida para memória 1", analisar, { objetivo: "corrida" });
    expect(create).toHaveBeenCalledTimes(1);
    await run("drone de corrida para memória 2", analisar);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("leitura de reserva (API falhou) é refeita quando a pessoa envia de novo", async () => {
    const create = installFakeClient(
      new Error("fora do ar"),
      message(analysis({}, { finalidade: "corrida" })),
    );
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const pedido = "drone de corrida para memória 3";
    expect((await run(pedido, appAnalyzer())).modo).toBe("simples");
    // Clique numa pergunta: usa a leitura guardada (não chama a API).
    expect((await run(pedido, appAnalyzer({ tentarDeNovo: false }))).modo).toBe("simples");
    expect(create).toHaveBeenCalledTimes(1);
    // Enviou de novo: tenta a IA outra vez.
    expect((await run(pedido, appAnalyzer({ tentarDeNovo: true }))).modo).toBe("ia");
    expect(create).toHaveBeenCalledTimes(2);
    erro.mockRestore();
  });

  it("sem chave: modo simples, sem chamar a API", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const create = installFakeClient(message(analysis({})));
    const r = await run("drone de corrida bem rápido", appAnalyzer());
    expect(r.modo).toBe("simples");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("explicação da escolha", () => {
  async function opcoes(pedido: string): Promise<OptionsResult> {
    installFakeClient(message(analysis({}, { finalidade: "corrida" })));
    const r = await run(pedido);
    if (r.tipo !== "opcoes") throw new Error(`esperava opções, veio ${r.tipo}`);
    return r;
  }

  it("aceita o texto da IA sem números", async () => {
    const r = await opcoes("drone de corrida para explicar 1");
    installFakeClient(
      message({ paragrafos: ["Você quer velocidade, e este formato é feito para isso."] }),
    );
    expect(await explainChoice(r)).toMatchObject({ origem: "ia" });
  });

  it("texto com número: volta para os motivos das regras", async () => {
    const r = await opcoes("drone de corrida para explicar 2");
    installFakeClient(message({ paragrafos: ["Ele chega a 120 km/h."] }));
    expect(await explainChoice(r)).toEqual({ paragrafos: r.motivos, origem: "regras" });
  });

  it("modo simples: motivos das regras, sem chamar a API", async () => {
    const r = await run("drone de corrida bem rápido", simpleAnalyzer);
    if (r.tipo !== "opcoes") throw new Error(r.tipo);
    const create = installFakeClient(message({ paragrafos: ["x"] }));
    expect((await explainChoice(r)).origem).toBe("regras");
    expect(create).not.toHaveBeenCalled();
  });
});
