import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { openDatabase } from "@/server/db/client";
import { usoApi } from "@/server/db/schema";

import {
  costUsd,
  LlmBadOutput,
  LlmRefusal,
  llmMode,
  servedModel,
  structuredCall,
  tokensByModel,
} from "./client";
import { FALLBACK_BETA, LLM_ROUTES } from "./config";
import { installFakeClient, message, removeFakeClient } from "./fake-client.test-helper";

const schema = z.object({ resposta: z.string() });
const chamada = { rota: "analise_pedido" as const, system: "sistema", user: "pedido", schema };

afterEach(() => removeFakeClient());

describe("custo da chamada", () => {
  const uso = {
    input_tokens: 1_000_000,
    output_tokens: 100_000,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    iterations: null,
  };

  it("sem iterações: tudo no modelo pedido", () => {
    const porModelo = tokensByModel(uso as never, "claude-opus-5-5");
    expect([...porModelo.keys()]).toEqual(["claude-opus-5-5"]);
    // 1 M de entrada a US$ 4 + 0,1 M de saída a US$ 20.
    expect(costUsd(porModelo)).toBeCloseTo(4 + 2, 6);
  });

  it("com fallback: cada iteração no preço do seu modelo", () => {
    const comFallback = {
      ...uso,
      iterations: [
        {
          type: "message",
          model: "claude-opus-5-5",
          input_tokens: 1000,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        {
          type: "fallback_message",
          model: "claude-opus-4-8",
          input_tokens: 1000,
          output_tokens: 1000,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      ],
    };
    const porModelo = tokensByModel(comFallback as never, "claude-opus-5-5");
    expect(porModelo.get("claude-opus-4-8")).toMatchObject({ input: 1000, output: 1000 });
    expect(costUsd(porModelo)).toBeCloseTo((1000 * 4 + 1000 * 5 + 1000 * 25) / 1e6, 9);
  });

  it("modelo que respondeu: o destino do último fallback", () => {
    const m = {
      content: [
        { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-4-8" } },
        { type: "text", text: "{}" },
      ],
    };
    expect(servedModel(m as never, "claude-opus-5-5")).toBe("claude-opus-4-8");
  });
});

describe("structuredCall", () => {
  it("manda modelo, esforço, fallback, cache e saída estruturada da rota", async () => {
    const create = installFakeClient(message({ resposta: "ok" }));
    const r = await structuredCall(chamada);
    expect(r.dados).toEqual({ resposta: "ok" });
    const params = (create.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(params).toMatchObject({
      model: LLM_ROUTES.analise_pedido.model,
      max_tokens: LLM_ROUTES.analise_pedido.max_tokens,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: [{ type: "text", text: "sistema", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "pedido" }],
    });
    expect(params.output_config).toMatchObject({
      effort: "low",
      format: { type: "json_schema" },
    });
  });

  it("usa só o texto depois do último fallback", async () => {
    installFakeClient(
      message(null, {
        content: [
          { type: "text", text: '{"resposta": "parcial' },
          {
            type: "fallback",
            from: { model: "claude-opus-5-5" },
            to: { model: "claude-opus-4-8" },
          },
          { type: "text", text: '{"resposta": "final"}' },
        ],
      }),
    );
    const r = await structuredCall(chamada);
    expect(r.dados.resposta).toBe("final");
    expect(r.uso.modelo).toBe("claude-opus-4-8");
  });

  it("recusa vira LlmRefusal (com a categoria) e o uso é registrado mesmo assim", async () => {
    installFakeClient(
      message(null, {
        content: [],
        stop_reason: "refusal",
        stop_details: { category: "general_harms" },
      }),
    );
    const db = openDatabase(":memory:");
    await expect(
      structuredCall({ ...chamada, registro: { db, cambioBrl: 5 } }),
    ).rejects.toMatchObject({
      name: "LlmRefusal",
      categoria: "general_harms",
    });
    const linhas = db.select().from(usoApi).all();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      rota: "analise_pedido",
      tokens_entrada: 1000,
      cambio_brl: 5,
    });
    expect(linhas[0]!.custo_brl).toBeCloseTo(linhas[0]!.custo_usd * 5, 9);
  });

  it.each([
    ["resposta cortada", message({ resposta: "x" }, { stop_reason: "max_tokens" })],
    ["JSON inválido", message(null, { content: [{ type: "text", text: "não é JSON" }] })],
    ["fora do schema", message({ outra: 1 })],
  ])("%s vira LlmBadOutput", async (_, resposta) => {
    installFakeClient(resposta);
    await expect(structuredCall(chamada)).rejects.toBeInstanceOf(LlmBadOutput);
  });

  it("LlmRefusal e LlmBadOutput são erros distintos", () => {
    expect(new LlmRefusal(null)).not.toBeInstanceOf(LlmBadOutput);
  });
});

describe("modo", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("sem chave → simples; com chave → ia; FROM_SCRATCH_LLM=simples força o simples", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.FROM_SCRATCH_LLM;
    expect(llmMode()).toBe("simples");
    process.env.ANTHROPIC_API_KEY = "sk-teste";
    expect(llmMode()).toBe("ia");
    process.env.FROM_SCRATCH_LLM = "simples";
    expect(llmMode()).toBe("simples");
  });
});
