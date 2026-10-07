import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessage, BetaUsage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";

import type { Db } from "@/server/db";
import { usoApi } from "@/server/db/schema";

import { FALLBACK_BETA, LLM_ROUTES, type LlmRoute, PRICING_USD_PER_MTOK } from "./config";

/*
 * Única porta de saída para a API do Claude (SPEC B.3). Cada chamada:
 * - usa o modelo e o esforço da rota (config.ts) e o fallback de recusa no servidor;
 * - pede saída estruturada e valida de novo com zod aqui (nunca confia no texto cru);
 * - põe o prompt de sistema em cache (o mesmo texto a cada pedido);
 * - registra tokens e custo em uso_api (SPEC B.5), com o câmbio do catálogo.
 * A chave fica só em .env.local (ANTHROPIC_API_KEY), lida pelo próprio SDK.
 */

export type LlmMode = "ia" | "simples";

/**
 * "ia" quando há chave da API; "simples" (palavras-chave, sem custo) sem chave ou com
 * FROM_SCRATCH_LLM=simples (usado nos testes E2E e para economizar).
 */
export function llmMode(): LlmMode {
  if (process.env.FROM_SCRATCH_LLM === "simples") return "simples";
  return process.env.ANTHROPIC_API_KEY?.trim() ? "ia" : "simples";
}

/** O modelo recusou (stop_reason "refusal"), mesmo depois do fallback. */
export class LlmRefusal extends Error {
  constructor(readonly categoria: string | null) {
    super("O modelo recusou o pedido.");
    this.name = "LlmRefusal";
  }
}

/** Resposta sem o formato esperado (cortada, JSON inválido ou fora do schema). */
export class LlmBadOutput extends Error {
  constructor(motivo: string) {
    super(`Resposta da IA fora do formato: ${motivo}`);
    this.name = "LlmBadOutput";
  }
}

/** Frase para leigos sobre uma falha da API (o detalhe técnico vai para o terminal). */
export function describeLlmError(error: unknown): string {
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  )
    return "A chave da API foi recusada: confira o ANTHROPIC_API_KEY no arquivo .env.local.";
  if (error instanceof Anthropic.RateLimitError)
    return "A API do Claude pediu uma pausa (limite de uso). Tente de novo em alguns minutos.";
  if (error instanceof Anthropic.APIConnectionError)
    return "Sem conexão com a API do Claude agora. Confira a internet e tente de novo.";
  if (error instanceof LlmBadOutput) return "A resposta da IA veio fora do formato esperado.";
  return "A API do Claude não respondeu agora.";
}

const cache = globalThis as typeof globalThis & { __fromScratchAnthropic?: Anthropic };

function client(): Anthropic {
  // O SDK lê ANTHROPIC_API_KEY do ambiente (o Next carrega o .env.local).
  cache.__fromScratchAnthropic ??= new Anthropic({ maxRetries: 2, timeout: 120_000 });
  return cache.__fromScratchAnthropic;
}

type TokenCount = { input: number; output: number; cache_write: number; cache_read: number };

/**
 * Tokens por modelo. Com fallback, a resposta pode vir de mais de um modelo: cada iteração
 * (usage.iterations) diz qual, e cada modelo tem o seu preço.
 */
export function tokensByModel(usage: BetaUsage, modeloPedido: string): Map<string, TokenCount> {
  const porModelo = new Map<string, TokenCount>();
  const somar = (modelo: string, t: TokenCount) => {
    const atual = porModelo.get(modelo) ?? { input: 0, output: 0, cache_write: 0, cache_read: 0 };
    porModelo.set(modelo, {
      input: atual.input + t.input,
      output: atual.output + t.output,
      cache_write: atual.cache_write + t.cache_write,
      cache_read: atual.cache_read + t.cache_read,
    });
  };
  const iteracoes = (usage.iterations ?? []).filter(
    (it) => it.type === "message" || it.type === "fallback_message",
  );
  if (iteracoes.length > 0) {
    for (const it of iteracoes) {
      if (it.type !== "message" && it.type !== "fallback_message") continue;
      somar(it.model ?? modeloPedido, {
        input: it.input_tokens,
        output: it.output_tokens,
        cache_write: it.cache_creation_input_tokens,
        cache_read: it.cache_read_input_tokens,
      });
    }
    return porModelo;
  }
  somar(modeloPedido, {
    input: usage.input_tokens,
    output: usage.output_tokens,
    cache_write: usage.cache_creation_input_tokens ?? 0,
    cache_read: usage.cache_read_input_tokens ?? 0,
  });
  return porModelo;
}

/** Custo em US$ pela tabela de preços (modelo desconhecido: preço do mais caro da tabela). */
export function costUsd(porModelo: ReadonlyMap<string, TokenCount>): number {
  const maisCaro = Object.values(PRICING_USD_PER_MTOK).reduce((a, b) =>
    b.output > a.output ? b : a,
  );
  let total = 0;
  for (const [modelo, t] of porModelo) {
    const p = PRICING_USD_PER_MTOK[modelo] ?? maisCaro;
    total +=
      (t.input * p.input +
        t.output * p.output +
        t.cache_write * p.cache_write +
        t.cache_read * p.cache_read) /
      1_000_000;
  }
  return total;
}

/** Modelo que de fato respondeu: o "to" do último bloco de fallback, ou o pedido. */
export function servedModel(message: BetaMessage, modeloPedido: string): string {
  let modelo = modeloPedido;
  for (const bloco of message.content) if (bloco.type === "fallback") modelo = bloco.to.model;
  return modelo;
}

/** Texto final: os blocos de texto depois do último fallback (o que veio antes foi descartado). */
function finalText(message: BetaMessage): string {
  let partes: string[] = [];
  for (const bloco of message.content) {
    if (bloco.type === "fallback") partes = [];
    else if (bloco.type === "text") partes.push(bloco.text);
  }
  return partes.join("");
}

export type CallRecord = {
  rota: LlmRoute;
  modelo: string;
  tokens: TokenCount;
  custo_usd: number;
};

export type StructuredCall<S extends z.ZodType> = {
  rota: LlmRoute;
  system: string;
  user: string;
  schema: S;
  /** Para gravar o uso (sem banco, nada é gravado: testes e scripts). */
  registro?: { db: Db; cambioBrl: number; projetoId?: string };
};

export type StructuredResult<T> = { dados: T; uso: CallRecord };

/** Chama o Claude com saída estruturada e devolve o objeto já validado pelo schema. */
export async function structuredCall<S extends z.ZodType>(
  pedido: StructuredCall<S>,
): Promise<StructuredResult<z.infer<S>>> {
  const rota = LLM_ROUTES[pedido.rota];
  const message = await client().beta.messages.create({
    model: rota.model,
    max_tokens: rota.max_tokens,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: [{ type: "text", text: pedido.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: pedido.user }],
    output_config: { effort: rota.effort, format: betaZodOutputFormat(pedido.schema) },
  });

  const porModelo = tokensByModel(message.usage, rota.model);
  const tokens = [...porModelo.values()].reduce(
    (a, t) => ({
      input: a.input + t.input,
      output: a.output + t.output,
      cache_write: a.cache_write + t.cache_write,
      cache_read: a.cache_read + t.cache_read,
    }),
    { input: 0, output: 0, cache_write: 0, cache_read: 0 },
  );
  const uso: CallRecord = {
    rota: pedido.rota,
    modelo: servedModel(message, rota.model),
    tokens,
    custo_usd: costUsd(porModelo),
  };
  if (pedido.registro) recordUsage(pedido.registro, uso);

  if (message.stop_reason === "refusal") {
    throw new LlmRefusal(message.stop_details?.category ?? null);
  }
  if (message.stop_reason === "max_tokens") throw new LlmBadOutput("resposta cortada");
  let bruto: unknown;
  try {
    bruto = JSON.parse(finalText(message));
  } catch {
    throw new LlmBadOutput("JSON inválido");
  }
  const validado = pedido.schema.safeParse(bruto);
  if (!validado.success) throw new LlmBadOutput(validado.error.issues[0]?.message ?? "schema");
  return { dados: validado.data, uso };
}

function recordUsage(
  registro: NonNullable<StructuredCall<z.ZodType>["registro"]>,
  uso: CallRecord,
) {
  try {
    registro.db
      .insert(usoApi)
      .values({
        rota: uso.rota,
        modelo: uso.modelo,
        tokens_entrada: uso.tokens.input,
        tokens_saida: uso.tokens.output,
        tokens_cache_escrita: uso.tokens.cache_write,
        tokens_cache_leitura: uso.tokens.cache_read,
        custo_usd: uso.custo_usd,
        cambio_brl: registro.cambioBrl,
        custo_brl: uso.custo_usd * registro.cambioBrl,
        projeto_id: registro.projetoId ?? null,
        criado_em: new Date(),
      })
      .run();
  } catch (error) {
    // Falhar ao registrar o custo não pode derrubar o pedido: só avisa no terminal.
    console.error("Não foi possível registrar o uso da API:", error);
  }
}
