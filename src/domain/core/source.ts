import { z } from "zod";

/** Data no formato AAAA-MM-DD (ex.: "2026-10-04"). */
export const isoDateSchema = z.iso.date();

export const SOURCE_KINDS = [
  "datasheet",
  "pagina_fabricante",
  "documentacao_oficial",
  "norma",
  "loja",
  "comunidade",
] as const;

/**
 * Fonte de uma informação. `url` só existe quando a página foi realmente aberta e conferida;
 * nunca inventamos endereços (SPEC B.1.6).
 */
export const sourceSchema = z.object({
  titulo: z.string().min(1),
  tipo: z.enum(SOURCE_KINDS),
  url: z.url().optional(),
  acessado_em: isoDateSchema.optional(),
  observacao: z.string().optional(),
});
export type Source = z.infer<typeof sourceSchema>;
