/*
 * Explicação da escolha (SPEC B.10, passo 4: "o LLM apenas explica a escolha"). A explicação
 * padrão é determinística (os motivos das regras). O LLM pode reescrever com as palavras da
 * pessoa, mas o texto dele só é aceito se não tiver NENHUM algarismo: números de engenharia vêm
 * do catálogo e do motor de cálculo, e aparecem nos cartões das opções (SPEC B.1.1).
 */

export type Explanation = { paragrafos: string[]; origem: "ia" | "regras" };

/** Algum algarismo (0–9 ou de outros alfabetos)? */
export function hasDigits(texto: string): boolean {
  return /\p{Nd}/u.test(texto);
}

const MAX_PARAGRAFOS = 4;
const MAX_CARACTERES = 700;

/**
 * Aceita a explicação do LLM só se ela for curta, não vazia e sem números. Qualquer problema:
 * volta a explicação das regras (nunca um texto pela metade).
 */
export function acceptExplanation(
  paragrafos: readonly string[],
  motivos: readonly string[],
): Explanation {
  const limpos = paragrafos.map((p) => p.trim()).filter((p) => p.length > 0);
  const ok =
    limpos.length > 0 &&
    limpos.length <= MAX_PARAGRAFOS &&
    limpos.every((p) => p.length <= MAX_CARACTERES && !hasDigits(p));
  return ok ? { paragrafos: limpos, origem: "ia" } : { paragrafos: [...motivos], origem: "regras" };
}
