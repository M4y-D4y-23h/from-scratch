import { z } from "zod";

import { isoDateSchema, sourceSchema } from "./source";

/**
 * Nível de um alerta de segurança:
 * - perigo: pode ferir alguém ou causar incêndio.
 * - atencao: pode estragar peças, causar queda ou impedir o voo.
 * - regulatorio: regra de órgão público (ANAC, DECEA, Anatel...). Informativo, não é
 *   aconselhamento jurídico; sempre acompanha "verifique as regras vigentes".
 * - info: boa prática.
 */
export const ALERT_LEVELS = ["perigo", "atencao", "regulatorio", "info"] as const;
export const alertLevelSchema = z.enum(ALERT_LEVELS);
export type AlertLevel = z.infer<typeof alertLevelSchema>;

export const safetyAlertSchema = z.object({
  id: z.string().min(1),
  nivel: alertLevelSchema,
  titulo: z.string().min(1),
  texto: z.string().min(1),
  /** O que fazer, em passos curtos. */
  acoes: z.array(z.string()).default([]),
  fontes: z.array(sourceSchema).default([]),
  /** Quando a informação foi conferida na fonte (regras mudam). */
  verificado_em: isoDateSchema.optional(),
});
export type SafetyAlert = z.infer<typeof safetyAlertSchema>;

export const REGULATORY_DISCLAIMER =
  "Informativo, não é aconselhamento jurídico. As regras mudam: verifique as regras vigentes nos sites oficiais antes de voar.";
