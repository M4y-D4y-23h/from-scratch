import { z } from "zod";

import { droneIntentSchema } from "@/domain/categories/drone/pipeline/intent";

/*
 * Formatos de saída do LLM (saída estruturada da API, validados também com zod no servidor;
 * SPEC B.3: "zod em toda saída do LLM").
 */

export const SAFETY_LABELS = ["permitido", "permitido_com_alertas", "bloqueado"] as const;

export const SAFETY_CATEGORIES = [
  "armas",
  "quimicos",
  "interferencia",
  "vigilancia",
  "ocultacao",
  "alcance_alem_da_visada",
  "voo_perto_de_pessoas",
  "uso_comercial",
  "fora_do_escopo",
  "nenhuma",
] as const;

/** Segurança (SPEC B.9, camada 2) + intenção (B.10, passo 2) numa resposta só. */
export const requestAnalysisSchema = z.object({
  seguranca: z.object({
    classificacao: z.enum(SAFETY_LABELS),
    categorias: z.array(z.enum(SAFETY_CATEGORIES)),
    motivo: z.string().describe("Uma frase curta, em português, para o registro de segurança."),
    precisa_esclarecer: z
      .boolean()
      .describe("true se o objetivo é ambíguo do ponto de vista de segurança."),
  }),
  intencao: droneIntentSchema,
});
export type RequestAnalysis = z.infer<typeof requestAnalysisSchema>;

/** Explicação da escolha em linguagem simples (sem números; o servidor confere). */
export const explanationSchema = z.object({
  paragrafos: z
    .array(z.string())
    .describe("De dois a quatro parágrafos curtos, sem nenhum número ou algarismo."),
});
