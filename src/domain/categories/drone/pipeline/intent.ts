import { z } from "zod";

/*
 * Intenção extraída de um pedido em linguagem natural (SPEC B.10, passo 2). É o que o LLM devolve
 * em saída estruturada, e também o que o "modo simples" (palavras-chave, sem IA) produz. Nenhum
 * campo é número de engenharia: são os desejos da pessoa (orçamento, peso, autonomia, alcance),
 * que o motor de cálculo depois confere com os números do catálogo.
 *
 * Campos nunca opcionais (null = "não disse"): a saída estruturada da API exige todas as chaves.
 */

export const FINALIDADES = [
  "filmar",
  "aprender",
  "freestyle",
  "corrida",
  "lazer",
  "carga",
  "outro",
  "nao_informado",
] as const;
export type Finalidade = (typeof FINALIDADES)[number];

export const AMBIENTES = ["dentro_de_casa", "ao_ar_livre", "os_dois", "nao_informado"] as const;
export type Ambiente = (typeof AMBIENTES)[number];

export const CAMERAS = [
  "nenhuma",
  "ao_vivo",
  "gravar",
  "ao_vivo_e_gravar",
  "nao_informado",
] as const;

export const CELULARES = ["android", "ios", "desconhecido"] as const;

export const droneIntentSchema = z.object({
  finalidade: z.enum(FINALIDADES).describe("O principal uso que a pessoa quer."),
  ambiente: z.enum(AMBIENTES).describe("Onde vai voar na maior parte do tempo."),
  orcamento_max_brl: z
    .number()
    .nullable()
    .describe("Teto de gasto em reais, se a pessoa disse (ex.: 'até R$ 2.000' -> 2000)."),
  orcamento_inclui_ferramentas: z
    .boolean()
    .nullable()
    .describe(
      "true se o orçamento inclui ferramentas; false se é só para peças; null se não disse.",
    ),
  limite_peso_g: z
    .number()
    .nullable()
    .describe("Peso máximo pedido em gramas (ex.: 'abaixo de 250 g' -> 250)."),
  autonomia_min_desejada: z
    .number()
    .nullable()
    .describe("Tempo de voo pedido, em minutos (ex.: '1 hora de voo' -> 60)."),
  alcance_m_desejado: z
    .number()
    .nullable()
    .describe("Distância pedida entre a pessoa e o drone, em metros (ex.: '10 km' -> 10000)."),
  carga_kg: z
    .number()
    .nullable()
    .describe("Peso que o drone deve carregar, em kg (ex.: 'carregue 20 kg' -> 20)."),
  camera: z.enum(CAMERAS).describe("Vídeo ao vivo (FPV/celular), gravar, os dois, nenhuma."),
  gps: z.boolean().nullable(),
  retorno_automatico: z
    .boolean()
    .nullable()
    .describe("Voltar sozinho se perder o sinal ou a bateria acabar."),
  estabilizacao: z.boolean().nullable().describe("Imagem/voo estável para filmar."),
  controle_pelo_celular: z.boolean().nullable().describe("Quer pilotar pelo celular."),
  celular: z.enum(CELULARES).describe("Sistema do celular, se a pessoa disse."),
  quer_velocidade: z.boolean().nullable().describe("Quer um drone muito rápido (corrida)."),
  uso_comercial: z
    .boolean()
    .nullable()
    .describe("Trabalho ou serviço pago (ex.: filmar eventos para clientes)."),
  perto_de_pessoas: z
    .boolean()
    .nullable()
    .describe("Vai voar perto de pessoas (eventos, festas, multidão)."),
  pequeno: z.boolean().nullable().describe("Pediu um drone pequeno."),
  ja_tem_ferramentas: z
    .boolean()
    .nullable()
    .describe("Disse que já tem ferramentas (ferro de solda etc.)."),
  observacoes: z
    .array(z.string())
    .describe("Outras restrições nas palavras da pessoa (prazo, espaço...), curtas."),
});

export type DroneIntent = z.infer<typeof droneIntentSchema>;

/** Intenção vazia: nada foi dito. */
export const EMPTY_INTENT: DroneIntent = {
  finalidade: "nao_informado",
  ambiente: "nao_informado",
  orcamento_max_brl: null,
  orcamento_inclui_ferramentas: null,
  limite_peso_g: null,
  autonomia_min_desejada: null,
  alcance_m_desejado: null,
  carga_kg: null,
  camera: "nao_informado",
  gps: null,
  retorno_automatico: null,
  estabilizacao: null,
  controle_pelo_celular: null,
  celular: "desconhecido",
  quer_velocidade: null,
  uso_comercial: null,
  perto_de_pessoas: null,
  pequeno: null,
  ja_tem_ferramentas: null,
  observacoes: [],
};

/**
 * Valores fora do razoável vindos do LLM (negativos, absurdos) viram null: melhor perguntar ou
 * assumir um padrão do que calcular em cima de um número estranho.
 */
export function sanitizeIntent(intent: DroneIntent): DroneIntent {
  const positivo = (v: number | null, max: number) =>
    v !== null && Number.isFinite(v) && v > 0 && v <= max ? v : null;
  return {
    ...intent,
    orcamento_max_brl: positivo(intent.orcamento_max_brl, 10_000_000),
    limite_peso_g: positivo(intent.limite_peso_g, 1_000_000),
    autonomia_min_desejada: positivo(intent.autonomia_min_desejada, 100_000),
    alcance_m_desejado: positivo(intent.alcance_m_desejado, 100_000_000),
    carga_kg: positivo(intent.carga_kg, 100_000),
    observacoes: intent.observacoes
      .map((o) => o.trim())
      .filter((o) => o.length > 0)
      .slice(0, 8),
  };
}
