import { headers } from "next/headers";

/*
 * Gravações (catálogo, projetos, "já tenho") só são aceitas de quem abre o app no próprio
 * computador (ADR-0025). O Next já recusa ações vindas de outro site (compara Origin com Host);
 * conferir que o Host é local fecha também o "DNS rebinding" (um site que aponta o próprio nome
 * para 127.0.0.1) e edições feitas por outro aparelho da rede.
 */

const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** "localhost:3000", "127.0.0.1", "[::1]:3000" → true; IP da rede ou outro nome → false. */
export function isLocalHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.trim().toLowerCase();
  const semPorta = h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : (h.split(":")[0] ?? "");
  return LOCAL_HOSTS.has(semPorta);
}

export const NOT_LOCAL_MESSAGE =
  "Por segurança, só dá para mudar dados no computador onde o From Scratch está rodando (endereço localhost ou 127.0.0.1).";

export class NotLocalError extends Error {
  constructor() {
    super(NOT_LOCAL_MESSAGE);
    this.name = "NotLocalError";
  }
}

/** Lança NotLocalError se o pedido não veio do próprio computador. */
export async function assertLocalRequest(): Promise<void> {
  const h = await headers();
  if (!isLocalHost(h.get("host"))) throw new NotLocalError();
}
