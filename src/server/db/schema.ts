import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import type { GlossaryTerm } from "@/domain/core/glossary";
import type { DroneCatalog } from "@/domain/categories/drone/catalog";

/*
 * Tabelas do banco local (SPEC B.5). Duas famílias:
 *
 * 1. Espelho do catálogo (catalogo_*, componentes, tabelas_empuxo, ferramentas, arquetipos,
 *    perfis_firmware, termos_glossario): reconstruídas a partir dos arquivos versionados sempre
 *    que o hash deles muda (ADR-0015). Nunca edite essas tabelas à mão: edite os arquivos.
 *    Cada linha guarda o item inteiro validado em "dados" e algumas colunas para busca/filtro.
 *
 * 2. Dados do usuário (projetos, versões, chat, uploads, uso da API, eventos de segurança,
 *    configurações): só existem no banco. Não têm chave estrangeira para o espelho do catálogo,
 *    porque o espelho é apagado e refeito; as versões de projeto guardam uma cópia do que usaram.
 */

type Componente = DroneCatalog["componentes"][number];
type TabelaEmpuxo = DroneCatalog["empuxo"][number];
type Ferramenta = DroneCatalog["ferramentas"][number];
type Arquetipo = DroneCatalog["arquetipos"][number];
type PerfilFirmware = DroneCatalog["perfis_firmware"][number];

const criadoEm = () =>
  integer("criado_em", { mode: "timestamp_ms" })
    .notNull()
    // Milissegundos desde 1970, como inteiro (o mesmo formato que o Drizzle grava).
    .default(sql`(cast(unixepoch('subsec') * 1000 as integer))`);

// ---------------------------------------------------------------------------
// Espelho do catálogo
// ---------------------------------------------------------------------------

/** Uma linha por fonte espelhada ("drone", "glossario"): hash do conteúdo e data da sincronização. */
export const catalogoMeta = sqliteTable("catalogo_meta", {
  fonte: text("fonte").primaryKey(),
  hash: text("hash").notNull(),
  itens: integer("itens").notNull(),
  sincronizado_em: integer("sincronizado_em", { mode: "timestamp_ms" }).notNull(),
});

export const componentes = sqliteTable(
  "componentes",
  {
    id: text("id").primaryKey(),
    categoria: text("categoria").notNull(),
    marca: text("marca").notNull(),
    modelo: text("modelo").notNull(),
    massa_g: real("massa_g"),
    /** Preço em lojas brasileiras (quando há fonte). */
    preco_min_brl: real("preco_min_brl"),
    preco_max_brl: real("preco_max_brl"),
    /** Preço em loja internacional, sem frete e tributos. */
    preco_min_usd: real("preco_min_usd"),
    preco_max_usd: real("preco_max_usd"),
    status_verificacao: text("status_verificacao").notNull(),
    dados: text("dados", { mode: "json" }).$type<Componente>().notNull(),
  },
  (t) => [index("componentes_categoria_idx").on(t.categoria)],
);

export const tabelasEmpuxo = sqliteTable(
  "tabelas_empuxo",
  {
    id: text("id").primaryKey(),
    motor_id: text("motor_id")
      .notNull()
      .references(() => componentes.id),
    helice_id: text("helice_id")
      .notNull()
      .references(() => componentes.id),
    celulas: integer("celulas").notNull(),
    status_verificacao: text("status_verificacao").notNull(),
    dados: text("dados", { mode: "json" }).$type<TabelaEmpuxo>().notNull(),
  },
  (t) => [index("tabelas_empuxo_conjunto_idx").on(t.motor_id, t.helice_id, t.celulas)],
);

export const ferramentas = sqliteTable("ferramentas", {
  id: text("id").primaryKey(),
  nome: text("nome").notNull(),
  tipo: text("tipo").notNull(),
  prioridade: text("prioridade").notNull(),
  /** Ausente = preço ainda não pesquisado. */
  preco_min_brl: real("preco_min_brl"),
  preco_max_brl: real("preco_max_brl"),
  preco_data: text("preco_data"),
  dados: text("dados", { mode: "json" }).$type<Ferramenta>().notNull(),
});

export const arquetipos = sqliteTable("arquetipos", {
  id: text("id").primaryKey(),
  nome: text("nome").notNull(),
  firmware: text("firmware").notNull(),
  dados: text("dados", { mode: "json" }).$type<Arquetipo>().notNull(),
});

export const perfisFirmware = sqliteTable("perfis_firmware", {
  id: text("id").primaryKey(),
  firmware: text("firmware").notNull(),
  versao_min: text("versao_min").notNull(),
  dados: text("dados", { mode: "json" }).$type<PerfilFirmware>().notNull(),
});

export const termosGlossario = sqliteTable("termos_glossario", {
  termo: text("termo").primaryKey(),
  explicacao: text("explicacao").notNull(),
  analogia: text("analogia"),
  relacionados: text("relacionados", { mode: "json" })
    .$type<GlossaryTerm["relacionados"]>()
    .notNull(),
});

// ---------------------------------------------------------------------------
// Dados do usuário
// ---------------------------------------------------------------------------

/** "Já tenho esta ferramenta": tira a ferramenta do custo (SPEC B.6). */
export const ferramentasQueTenho = sqliteTable("ferramentas_que_tenho", {
  ferramenta_id: text("ferramenta_id").primaryKey(),
  criado_em: criadoEm(),
});

export const projetos = sqliteTable("projetos", {
  id: text("id").primaryKey(),
  categoria: text("categoria").notNull().default("drone"),
  titulo: text("titulo").notNull(),
  prompt_original: text("prompt_original").notNull(),
  versao_atual: integer("versao_atual").notNull().default(1),
  criado_em: criadoEm(),
  atualizado_em: integer("atualizado_em", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Cada alteração do projeto (escolha de opção, troca de peça...) gera uma versão nova, com cópia
 * completa do resultado. Assim uma versão antiga continua reproduzível mesmo se o catálogo mudar.
 */
export const versoesProjeto = sqliteTable(
  "versoes_projeto",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projeto_id: text("projeto_id")
      .notNull()
      .references(() => projetos.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull(),
    motivo: text("motivo").notNull(),
    /** Hash do catálogo usado para gerar esta versão. */
    catalogo_hash: text("catalogo_hash").notNull(),
    intencao: text("intencao", { mode: "json" }),
    respostas: text("respostas", { mode: "json" }),
    opcoes: text("opcoes", { mode: "json" }),
    opcao_escolhida: text("opcao_escolhida"),
    bom: text("bom", { mode: "json" }),
    calculos: text("calculos", { mode: "json" }),
    dificuldade: text("dificuldade", { mode: "json" }),
    custos: text("custos", { mode: "json" }),
    locais: text("locais", { mode: "json" }),
    alertas: text("alertas", { mode: "json" }),
    cena: text("cena", { mode: "json" }),
    criado_em: criadoEm(),
  },
  (t) => [uniqueIndex("versoes_projeto_numero_idx").on(t.projeto_id, t.numero)],
);

/**
 * Progresso no guia de montagem. Fica fora das versões: marcar um passo como feito não muda o
 * projeto (não faz sentido criar uma versão nova a cada checkbox).
 */
export const progressoPassos = sqliteTable(
  "progresso_passos",
  {
    projeto_id: text("projeto_id")
      .notNull()
      .references(() => projetos.id, { onDelete: "cascade" }),
    passo_id: text("passo_id").notNull(),
    status: text("status", { enum: ["pendente", "feito"] }).notNull(),
    /** Quando o checklist de segurança bloqueante do passo foi confirmado. */
    checkpoint_confirmado_em: integer("checkpoint_confirmado_em", { mode: "timestamp_ms" }),
    atualizado_em: integer("atualizado_em", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.projeto_id, t.passo_id] })],
);

export const mensagensChat = sqliteTable(
  "mensagens_chat",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projeto_id: text("projeto_id")
      .notNull()
      .references(() => projetos.id, { onDelete: "cascade" }),
    papel: text("papel", { enum: ["usuario", "assistente"] }).notNull(),
    conteudo: text("conteudo").notNull(),
    passo_id: text("passo_id"),
    /** Ids de uploads anexados. */
    anexos: text("anexos", { mode: "json" }).$type<string[]>().notNull().default([]),
    criado_em: criadoEm(),
  },
  (t) => [index("mensagens_chat_projeto_idx").on(t.projeto_id)],
);

export const uploads = sqliteTable("uploads", {
  /** SHA-256 do arquivo já re-codificado (o mesmo arquivo enviado duas vezes vira um só). */
  hash: text("hash").primaryKey(),
  mime: text("mime").notNull(),
  largura: integer("largura").notNull(),
  altura: integer("altura").notNull(),
  bytes: integer("bytes").notNull(),
  /** Caminho privado, fora de public/. */
  caminho: text("caminho").notNull(),
  criado_em: criadoEm(),
});

export const usoApi = sqliteTable(
  "uso_api",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    rota: text("rota").notNull(),
    modelo: text("modelo").notNull(),
    tokens_entrada: integer("tokens_entrada").notNull(),
    tokens_saida: integer("tokens_saida").notNull(),
    tokens_cache_escrita: integer("tokens_cache_escrita").notNull().default(0),
    tokens_cache_leitura: integer("tokens_cache_leitura").notNull().default(0),
    custo_usd: real("custo_usd").notNull(),
    /** Câmbio usado na conversão (configurável). */
    cambio_brl: real("cambio_brl").notNull(),
    custo_brl: real("custo_brl").notNull(),
    projeto_id: text("projeto_id"),
    criado_em: criadoEm(),
  },
  (t) => [index("uso_api_data_idx").on(t.criado_em)],
);

export const eventosSeguranca = sqliteTable("eventos_seguranca", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  origem: text("origem", { enum: ["prompt", "chat", "projeto"] }).notNull(),
  texto: text("texto").notNull(),
  classificacao: text("classificacao", {
    enum: ["permitido", "permitido_com_alertas", "bloqueado"],
  }).notNull(),
  categorias: text("categorias", { mode: "json" }).$type<string[]>().notNull().default([]),
  motivo: text("motivo").notNull(),
  acao: text("acao").notNull(),
  projeto_id: text("projeto_id"),
  criado_em: criadoEm(),
});

/** Parâmetros editáveis com data (câmbio, impostos de importação, limites de gasto...). */
export const configuracoes = sqliteTable("configuracoes", {
  chave: text("chave").primaryKey(),
  valor: text("valor", { mode: "json" }).notNull(),
  atualizado_em: integer("atualizado_em", { mode: "timestamp_ms" }).notNull(),
});
