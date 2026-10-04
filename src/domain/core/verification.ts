import { z } from "zod";

/**
 * Selos de confiança (SPEC B.1.2). Todo dado mostrado ao usuário carrega um deles.
 *
 * - verificado: spec com fonte confirmada pelo dono do projeto.
 * - estimativa: preço estimado ou valor calculado (ex.: tempo de voo).
 * - nao_verificado: dado inserido que ninguém confirmou ainda.
 */
export const VERIFICATION_STATUSES = ["verificado", "estimativa", "nao_verificado"] as const;
export const verificationStatusSchema = z.enum(VERIFICATION_STATUSES);
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;

export const SEAL: Record<VerificationStatus, { simbolo: string; rotulo: string }> = {
  verificado: { simbolo: "✅", rotulo: "Verificado" },
  estimativa: { simbolo: "⚠️", rotulo: "Estimativa" },
  nao_verificado: { simbolo: "❓", rotulo: "Não verificado" },
};

// Quanto maior, mais confiável.
const RANK: Record<VerificationStatus, number> = {
  nao_verificado: 0,
  estimativa: 1,
  verificado: 2,
};

/** O selo mais fraco de uma lista. Lista vazia = nada foi informado = não verificado. */
export function weakestStatus(statuses: readonly VerificationStatus[]): VerificationStatus {
  let weakest: VerificationStatus | undefined;
  for (const status of statuses) {
    if (weakest === undefined || RANK[status] < RANK[weakest]) weakest = status;
  }
  return weakest ?? "nao_verificado";
}

/**
 * Como um valor foi derivado de outros:
 * - "comparacao": checagem direta entre specs (ex.: furação 16x16 = 16x16). Pode ser ✅ se
 *   todas as entradas forem ✅.
 * - "estimativa": modelo/aproximação (ex.: TWR, autonomia, soma de preços). Nunca passa de ⚠️,
 *   porque o resultado depende de condições reais (vento, temperatura, desgaste, margens).
 */
export type DerivationKind = "comparacao" | "estimativa";

/**
 * Selo de um valor derivado: herda o mais fraco das entradas; se for estimativa, o teto é ⚠️.
 * Assim um cálculo feito com uma peça ❓ aparece como ❓, nunca como algo mais confiável.
 */
export function deriveStatus(
  inputs: readonly VerificationStatus[],
  kind: DerivationKind,
): VerificationStatus {
  const weakest = weakestStatus(inputs);
  if (kind === "estimativa" && weakest === "verificado") return "estimativa";
  return weakest;
}
