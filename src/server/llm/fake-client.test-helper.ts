import { vi } from "vitest";

/*
 * Cliente falso da API do Claude para os testes: nenhuma chamada sai do computador. O cliente
 * real fica guardado no globalThis (client.ts); os testes põem este no lugar.
 */

type FakeMessage = {
  content: Array<Record<string, unknown>>;
  stop_reason: string;
  stop_details?: Record<string, unknown> | null;
  usage?: Record<string, unknown>;
};

export function message(dados: unknown, extra: Partial<FakeMessage> = {}): FakeMessage {
  return {
    content: [{ type: "text", text: JSON.stringify(dados) }],
    stop_reason: "end_turn",
    stop_details: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      iterations: null,
    },
    ...extra,
  };
}

const g = globalThis as typeof globalThis & { __fromScratchAnthropic?: unknown };

/** Instala o cliente falso; `respostas` são devolvidas em ordem (Error = a chamada falha). */
export function installFakeClient(...respostas: Array<FakeMessage | Error>) {
  const create = vi.fn(async () => {
    const r = respostas.length > 1 ? respostas.shift() : respostas[0];
    if (!r) throw new Error("sem resposta falsa");
    if (r instanceof Error) throw r;
    return r;
  });
  g.__fromScratchAnthropic = { beta: { messages: { create } } };
  return create;
}

export function removeFakeClient() {
  delete g.__fromScratchAnthropic;
}
