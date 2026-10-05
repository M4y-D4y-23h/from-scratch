/*
 * Links de compra são sempre BUSCAS geradas a partir de um termo, nunca o endereço de um anúncio
 * específico (SPEC B.1.6). Os formatos abaixo foram conferidos em 2026-10-05:
 * - Mercado Livre: lista.mercadolivre.com.br/<palavras-separadas-por-hífen> é a página de
 *   resultados (para acesso automático o site pede verificação de robô e guarda a busca como
 *   destino, o que confirma o formato).
 * - AliExpress: pt.aliexpress.com/wholesale?SearchText=<termo> abre a página de resultados
 *   (redireciona para /w/wholesale-<termo>.html).
 * Amazon Brasil ficou de fora: o site recusa acesso automático e o formato não pôde ser conferido.
 */

export type SearchSite = "mercado_livre" | "aliexpress";

export const SEARCH_SITE_LABEL: Record<SearchSite, string> = {
  mercado_livre: "Mercado Livre",
  aliexpress: "AliExpress",
};

export type SearchLink = { site: SearchSite; rotulo: string; url: string };

function words(termo: string): string[] {
  return termo.trim().split(/\s+/).filter(Boolean);
}

/** Busca no Mercado Livre: as palavras do termo separadas por hífen. */
export function mercadoLivreSearchUrl(termo: string): string {
  return `https://lista.mercadolivre.com.br/${words(termo).map(encodeURIComponent).join("-")}`;
}

/** Busca no AliExpress (site em português). */
export function aliExpressSearchUrl(termo: string): string {
  return `https://pt.aliexpress.com/wholesale?SearchText=${encodeURIComponent(words(termo).join(" "))}`;
}

export function searchLink(site: SearchSite, termo: string): SearchLink {
  const url = site === "mercado_livre" ? mercadoLivreSearchUrl(termo) : aliExpressSearchUrl(termo);
  return { site, rotulo: SEARCH_SITE_LABEL[site], url };
}
