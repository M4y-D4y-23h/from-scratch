import { z } from "zod";

import { isoDateSchema, sourceSchema } from "./source";
import { deriveStatus, verificationStatusSchema, type VerificationStatus } from "./verification";

/**
 * Faixa de preço em reais, como está no catálogo (fácil de ler e editar no JSON).
 * As contas são feitas em centavos inteiros para não acumular erro de ponto flutuante.
 */
export const priceRangeSchema = z
  .object({
    min: z.number().nonnegative(),
    max: z.number().nonnegative(),
    data: isoDateSchema,
    status: verificationStatusSchema.default("estimativa"),
    fontes: z.array(sourceSchema).default([]),
    observacao: z.string().optional(),
  })
  .refine((p) => p.max >= p.min, { message: "max deve ser maior ou igual a min" });
export type PriceRange = z.infer<typeof priceRangeSchema>;

/**
 * Preço de referência em dólares numa loja internacional (ex.: loja oficial do fabricante), sem
 * frete e sem tributos. O custo em R$ sai do parâmetro de importação (src/domain/core/importacao.ts).
 */
export const usdPriceSchema = z
  .object({
    min: z.number().nonnegative(),
    max: z.number().nonnegative(),
    data: isoDateSchema,
    /** Nome da loja (ex.: "Loja oficial da Holybro"). */
    loja: z.string().min(1),
    fontes: z.array(sourceSchema).min(1),
    observacao: z.string().optional(),
  })
  .refine((p) => p.max >= p.min, { message: "max deve ser maior ou igual a min" });
export type UsdPrice = z.infer<typeof usdPriceSchema>;

/** Faixa em centavos, usada nos cálculos. */
export type CentsRange = {
  min_centavos: number;
  max_centavos: number;
  status: VerificationStatus;
  /** Data mais antiga entre os preços somados (o total é tão atual quanto o preço mais velho). */
  data_mais_antiga?: string;
};

export function toCents(reais: number): number {
  return Math.round(reais * 100);
}

export function priceToCents(price: PriceRange, quantidade = 1): CentsRange {
  return {
    min_centavos: toCents(price.min) * quantidade,
    max_centavos: toCents(price.max) * quantidade,
    status: price.status,
    data_mais_antiga: price.data,
  };
}

export const ZERO_RANGE: CentsRange = { min_centavos: 0, max_centavos: 0, status: "estimativa" };

/** Soma faixas de preço. Uma soma de preços é sempre uma estimativa (⚠️ no melhor caso). */
export function sumRanges(ranges: readonly CentsRange[]): CentsRange {
  if (ranges.length === 0) return ZERO_RANGE;
  let min = 0;
  let max = 0;
  let oldest: string | undefined;
  for (const range of ranges) {
    min += range.min_centavos;
    max += range.max_centavos;
    if (range.data_mais_antiga && (!oldest || range.data_mais_antiga < oldest)) {
      oldest = range.data_mais_antiga;
    }
  }
  return {
    min_centavos: min,
    max_centavos: max,
    status: deriveStatus(
      ranges.map((r) => r.status),
      "estimativa",
    ),
    data_mais_antiga: oldest,
  };
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(centavos: number): string {
  return BRL.format(centavos / 100);
}

export function formatRange(range: CentsRange): string {
  if (range.min_centavos === range.max_centavos) return formatBRL(range.min_centavos);
  return `${formatBRL(range.min_centavos)} a ${formatBRL(range.max_centavos)}`;
}
