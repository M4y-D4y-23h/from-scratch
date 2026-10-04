import { z } from "zod";

/** Onde cada coisa acontece (SPEC B.12, aba "Onde fazer"). */
export const LOCATION_KINDS = [
  "comprar_pronto",
  "em_casa",
  "servico_externo",
  "espaco_aberto",
] as const;
export const locationKindSchema = z.enum(LOCATION_KINDS);
export type LocationKind = z.infer<typeof locationKindSchema>;

export const LOCATION_LABEL: Record<LocationKind, { simbolo: string; rotulo: string }> = {
  comprar_pronto: { simbolo: "🛒", rotulo: "Comprar pronto" },
  em_casa: { simbolo: "🏠", rotulo: "Em casa, na bancada" },
  servico_externo: { simbolo: "🏭", rotulo: "Serviço externo" },
  espaco_aberto: { simbolo: "🌳", rotulo: "Espaço aberto" },
};
