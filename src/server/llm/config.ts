/*
 * Modelo e esforço de cada rota que usa o Claude (SPEC B.3). Padrão: claude-opus-5-5 em todas.
 * Para economizar, o dono pode trocar uma rota para "claude-sonnet-5-5" aqui. Não troque por
 * conta própria.
 *
 * No Claude Opus 5.5 o pensamento não pode ser desligado: a profundidade e o custo se controlam
 * com output_config.effort. O padrão do modelo é "medium"; cada rota define o seu explicitamente
 * (SPEC B.3: low para classificação e intenção, high para a geração do projeto).
 */

export type LlmRoute = "analise_pedido" | "explicacao_projeto";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export const LLM_ROUTES: Record<LlmRoute, { model: string; effort: Effort; max_tokens: number }> = {
  /** Segurança (B.9, camada 2) + extração de intenção (B.10, passo 2), numa chamada só. */
  analise_pedido: { model: "claude-opus-5-5", effort: "low", max_tokens: 16000 },
  /** Explica a escolha do arquétipo em linguagem simples, sem números (B.10, passos 4 e 7). */
  explicacao_projeto: { model: "claude-opus-5-5", effort: "high", max_tokens: 16000 },
};

/**
 * Fallback de recusa no servidor (forma "default": a API escolhe o modelo de reserva pela
 * categoria da recusa). Cabeçalho beta conferido na referência da API em 2026-10-07.
 */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * Preços por milhão de tokens, em US$ (referência da API conferida em 2026-10-07; confira em
 * https://www.anthropic.com/pricing antes de confiar nos custos). Escrita de cache com TTL de
 * 5 minutos custa cerca de 1,25 vez a entrada; leitura de cache tem preço próprio.
 */
export const PRICING_CHECKED_ON = "2026-10-07";
export const PRICING_USD_PER_MTOK: Record<
  string,
  { input: number; output: number; cache_write: number; cache_read: number }
> = {
  "claude-opus-5-5": { input: 4, output: 20, cache_write: 5, cache_read: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cache_write: 2.5, cache_read: 0.2 },
  // Modelos que o fallback pode usar no lugar do principal (ex.: recusas da categoria cyber).
  "claude-opus-5": { input: 5, output: 25, cache_write: 6.25, cache_read: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cache_write: 6.25, cache_read: 0.5 },
};

/** Versão dos prompts: muda quando o texto muda (entra na chave da memória das análises). */
export const PROMPT_VERSION = "2026-10-07.1";
