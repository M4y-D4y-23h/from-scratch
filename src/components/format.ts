import { type CentsRange, formatBRL, formatRange } from "@/domain/core/money";

/*
 * Formatação de números da interface em PT-BR (vírgula decimal, ponto de milhar). Só formata:
 * todo número vem do motor de cálculo ou do catálogo.
 */

/** 1234.5 → "1.234,5". `-0` vira "0". */
export function fmt(n: number, casas = 1): string {
  const v = Object.is(Math.round(n * 10 ** casas) / 10 ** casas, -0) ? 0 : n;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

/** "2026-10-02" → "02/10/2026". */
export function dataBr(iso: string | undefined): string {
  if (!iso) return "sem data";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/** Data e hora curtas de um instante ISO ("05/10/2026 14:32"). */
export function dataHoraBr(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export { formatBRL, formatRange };

/** Faixa de diferença em R$ com sinal: "+R$ 120,00 a +R$ 180,00", "sem diferença". */
export function fmtDeltaBRL(delta: { min_centavos: number; max_centavos: number }): string {
  const s = (c: number) =>
    c > 0 ? `+${formatBRL(c)}` : c < 0 ? `−${formatBRL(-c)}` : formatBRL(0);
  if (delta.min_centavos === 0 && delta.max_centavos === 0) return "mesmo preço";
  if (delta.min_centavos === delta.max_centavos) return s(delta.min_centavos);
  return `${s(delta.min_centavos)} a ${s(delta.max_centavos)}`;
}

/** Diferença com sinal e unidade ("+14 g", "−0,3"). Zero vira "sem mudança". */
export function fmtDelta(n: number | undefined, unidade = "", casas = 0): string {
  if (n === undefined) return "sem dado";
  const r = Math.round(n * 10 ** casas) / 10 ** casas;
  if (r === 0) return "sem mudança";
  return `${r > 0 ? "+" : "−"}${fmt(Math.abs(r), casas)}${unidade ? ` ${unidade}` : ""}`;
}

/** "8,5 a 12 min". */
export function fmtMinutes(min?: number, max?: number): string {
  if (min === undefined || max === undefined) return "sem dado";
  return `${fmt(min)} a ${fmt(max)} min`;
}

/** Faixa de horas [a, b] → "3 a 8 h". */
export function fmtHours([a, b]: readonly [number, number]): string {
  return a === b ? `${fmt(a)} h` : `${fmt(a)} a ${fmt(b)} h`;
}

export function rangeOrZero(range: CentsRange | undefined): string {
  return range ? formatRange(range) : "sem preço pesquisado";
}

/** Texto do preço com a data: "R$ 10,00 a R$ 20,00 (02/10/2026)". */
export function priceWithDate(range: CentsRange): string {
  return `${formatRange(range)} (${dataBr(range.data_mais_antiga)})`;
}
