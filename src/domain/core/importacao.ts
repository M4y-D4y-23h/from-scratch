import { z } from "zod";

import type { CentsRange } from "./money";
import { isoDateSchema, sourceSchema } from "./source";

/*
 * Custo de importação (SPEC B.6): as regras mudam, então tudo aqui é PARÂMETRO com data e fonte,
 * nunca constante no código. O valor padrão fica em data/catalog/drone/parametros/importacao.json.
 *
 * Modelo (pessoa física, compra em plataforma do programa Remessa Conforme):
 *   imposto de importação (II) por faixa do valor do pacote em US$, com dedução fixa;
 *   ICMS estadual cobrado "por dentro" (a base inclui o próprio ICMS): total = (valor + II) / (1 − ICMS).
 * Frete, IOF e spread do cartão não entram (ficam no aviso).
 */

const pct = z.number().min(0).max(100);

export const importParamsSchema = z.object({
  verificado_em: isoDateSchema,
  cambio: z.object({
    /** Reais por dólar (ex.: PTAX de venda do Banco Central). */
    usd_brl: z.number().positive(),
    data: isoDateSchema,
    fonte: sourceSchema,
  }),
  /** ICMS sobre importação: [menor, maior] entre os estados. */
  icms_pct: z.tuple([pct, pct]).refine(([a, b]) => b >= a, "faixa invertida"),
  /** Faixas do imposto de importação, em ordem crescente de valor do pacote (US$). */
  faixas_ii: z
    .array(
      z.object({
        ate_usd: z.number().positive(),
        aliquota_pct: pct,
        deducao_usd: z.number().nonnegative(),
      }),
    )
    .min(1),
  fontes: z.array(sourceSchema).min(1),
  aviso: z.string().min(1),
});
export type ImportParams = z.infer<typeof importParamsSchema>;

/** Imposto de importação (US$) de um pacote com este valor. Acima da última faixa: sem regra. */
export function importTaxUsd(valorUsd: number, params: ImportParams): number | undefined {
  const faixa = params.faixas_ii.find((f) => valorUsd <= f.ate_usd);
  if (!faixa) return undefined;
  return Math.max(0, (valorUsd * faixa.aliquota_pct) / 100 - faixa.deducao_usd);
}

function withIcms(valorUsd: number, icmsPct: number): number {
  return valorUsd / (1 - icmsPct / 100);
}

/** A faixa mais alta de imposto (para o cenário caro: tudo num pacote grande). */
function maxRate(params: ImportParams): number {
  return Math.max(...params.faixas_ii.map((f) => f.aliquota_pct));
}

/**
 * Faixa em R$ de uma peça importada, com tributos:
 * - mínimo: a peça sozinha num pacote (menor imposto possível), ICMS mais baixo;
 * - máximo: a peça dentro de um pacote grande (alíquota cheia, sem dedução), ICMS mais alto.
 * Sempre ⚠️ estimativa.
 */
export function importedPriceRange(
  usd: { min: number; max: number; data: string },
  params: ImportParams,
  quantidade = 1,
): CentsRange & { regra_aplicada: boolean } {
  const [icmsMin, icmsMax] = params.icms_pct;
  const valorMin = usd.min * quantidade;
  const iiMin = importTaxUsd(valorMin, params);
  const minUsd = withIcms(valorMin + (iiMin ?? (valorMin * maxRate(params)) / 100), icmsMin);
  const maxUsd = withIcms(usd.max * quantidade * (1 + maxRate(params) / 100), icmsMax);
  const toCentsBrl = (v: number) => Math.round(v * params.cambio.usd_brl * 100);
  return {
    min_centavos: toCentsBrl(minUsd),
    max_centavos: toCentsBrl(maxUsd),
    status: "estimativa",
    // O total é tão antigo quanto o dado mais velho: preço em US$ ou câmbio.
    data_mais_antiga: usd.data < params.cambio.data ? usd.data : params.cambio.data,
    regra_aplicada: iiMin !== undefined,
  };
}
