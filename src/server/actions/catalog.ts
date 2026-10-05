"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { isoDateSchema, SOURCE_KINDS, type Source } from "@/domain/core/source";
import { getDb, syncAll } from "@/server/db";
import {
  CATALOG_KINDS,
  readCatalogItem,
  readImportParams,
  updateCatalogItem,
  updateImportParams,
  type WriteResult,
} from "@/server/catalog/write";
import { assertLocalRequest, NotLocalError } from "@/server/security/local";

/*
 * Ações da página /catalogo (SPEC B.6): verificar com a URL da fonte, atualizar preços com data,
 * editar o item em JSON e mudar os parâmetros de importação. Tudo grava nos arquivos JSON do
 * catálogo (ADR-0015), só depois de validar o catálogo inteiro com a mudança, e só se o pedido
 * veio do próprio computador (ADR-0025).
 */

export type CatalogActionResult =
  { ok: true; mensagem: string } | { ok: false; erro: string; problemas?: string[] };

const kindSchema = z.enum(CATALOG_KINDS);

async function guard(): Promise<CatalogActionResult | undefined> {
  try {
    await assertLocalRequest();
    return undefined;
  } catch (error) {
    if (error instanceof NotLocalError) return { ok: false, erro: error.message };
    throw error;
  }
}

/** Depois de gravar: atualiza o espelho no banco e a página. */
function done(r: WriteResult, mensagem: string): CatalogActionResult {
  if (!r.ok) {
    return { ok: false, erro: "O catálogo não foi alterado.", problemas: r.problemas };
  }
  syncAll(getDb());
  refresh();
  return { ok: true, mensagem: `${mensagem} (arquivo ${r.arquivo}).` };
}

/**
 * Põe uma chave nova numa posição natural do JSON (antes da primeira chave de `antesDe` que
 * existir); se a chave já existe, troca o valor no lugar. Assim o diff no git fica pequeno.
 */
function withKey(
  obj: Record<string, unknown>,
  chave: string,
  valor: unknown,
  antesDe: readonly string[],
): Record<string, unknown> {
  if (chave in obj) return { ...obj, [chave]: valor };
  const alvo = antesDe.find((k) => k in obj);
  if (!alvo) return { ...obj, [chave]: valor };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === alvo) out[chave] = valor;
    out[k] = v;
  }
  return out;
}

const sourceFormSchema = z.object({
  titulo: z.string().trim().min(3, "Escreva um título para a fonte (ex.: página do fabricante)."),
  tipo: z.enum(SOURCE_KINDS),
  url: z
    .url("Cole o endereço completo da página (começando com https://).")
    .refine((u) => u.startsWith("https://"), "Use um endereço https://."),
  acessado_em: isoDateSchema,
  observacao: z.string().trim().max(500).optional(),
});

function addSource(fontes: unknown, nova: Source): Source[] {
  const lista = Array.isArray(fontes) ? (fontes as Source[]) : [];
  return [...lista.filter((f) => f.url !== nova.url), nova];
}

/** Edita o item inteiro a partir do JSON digitado. */
export async function saveCatalogJsonAction(
  kind: string,
  id: string,
  versao: string,
  texto: string,
): Promise<CatalogActionResult> {
  const bloqueio = await guard();
  if (bloqueio) return bloqueio;
  const k = kindSchema.safeParse(kind);
  if (!k.success) return { ok: false, erro: "Tipo de item inválido." };
  let novo: unknown;
  try {
    novo = JSON.parse(texto);
  } catch (error) {
    return {
      ok: false,
      erro: "O texto não é um JSON válido.",
      problemas: [(error as Error).message],
    };
  }
  const r = await updateCatalogItem({ kind: k.data, id, novo, versao });
  return done(r, "Item salvo");
}

/** Marca como ✅ verificado, guardando a fonte conferida (link + data). */
export async function verifyCatalogItemAction(
  kind: string,
  id: string,
  versao: string,
  fonte: unknown,
): Promise<CatalogActionResult> {
  const bloqueio = await guard();
  if (bloqueio) return bloqueio;
  const k = z.enum(["componente", "empuxo", "pronto"]).safeParse(kind);
  if (!k.success) return { ok: false, erro: "Este tipo de item não tem selo de verificação." };
  const f = sourceFormSchema.safeParse(fonte);
  if (!f.success) {
    return {
      ok: false,
      erro: "Fonte incompleta.",
      problemas: f.error.issues.map((i) => i.message),
    };
  }
  const atual = readCatalogItem(k.data, id);
  if (!atual) return { ok: false, erro: "Item não encontrado." };
  const novo = {
    ...withKey(atual.item, "fontes", addSource(atual.item.fontes, f.data), ["status_verificacao"]),
    status_verificacao: "verificado",
  };
  return done(
    await updateCatalogItem({ kind: k.data, id, novo, versao }),
    "Marcado como verificado",
  );
}

/** Volta o selo para ❓ (ex.: a página do fabricante mudou e é preciso conferir de novo). */
export async function unverifyCatalogItemAction(
  kind: string,
  id: string,
  versao: string,
): Promise<CatalogActionResult> {
  const bloqueio = await guard();
  if (bloqueio) return bloqueio;
  const k = z.enum(["componente", "empuxo", "pronto"]).safeParse(kind);
  if (!k.success) return { ok: false, erro: "Este tipo de item não tem selo de verificação." };
  const atual = readCatalogItem(k.data, id);
  if (!atual) return { ok: false, erro: "Item não encontrado." };
  const novo = { ...atual.item, status_verificacao: "nao_verificado" };
  return done(
    await updateCatalogItem({ kind: k.data, id, novo, versao }),
    "Marcado como não verificado",
  );
}

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v ? v : undefined));

const priceFormSchema = z
  .object({
    moeda: z.enum(["brl", "usd"]),
    min: z.coerce.number().nonnegative("O preço não pode ser negativo."),
    max: z.coerce.number().nonnegative("O preço não pode ser negativo."),
    data: isoDateSchema,
    status: z.enum(["estimativa", "verificado"]).default("estimativa"),
    loja: optionalText,
    fonte_titulo: optionalText,
    fonte_url: optionalText,
    observacao: optionalText,
  })
  .refine((p) => p.max >= p.min, { message: "O máximo precisa ser maior ou igual ao mínimo." })
  .refine((p) => !p.fonte_url || p.fonte_url.startsWith("https://"), {
    message: "O link da fonte precisa começar com https://.",
  });

/** Atualiza o preço (R$ em loja brasileira, ou US$ em loja internacional), sempre com data. */
export async function savePriceAction(
  kind: string,
  id: string,
  versao: string,
  form: unknown,
): Promise<CatalogActionResult> {
  const bloqueio = await guard();
  if (bloqueio) return bloqueio;
  const k = kindSchema.safeParse(kind);
  if (!k.success || k.data === "empuxo") return { ok: false, erro: "Este item não tem preço." };
  const p = priceFormSchema.safeParse(form);
  if (!p.success) {
    return { ok: false, erro: "Preço inválido.", problemas: p.error.issues.map((i) => i.message) };
  }
  const atual = readCatalogItem(k.data, id);
  if (!atual) return { ok: false, erro: "Item não encontrado." };
  const fonte: Source | undefined = p.data.fonte_url
    ? {
        titulo: p.data.fonte_titulo ?? "Página da loja",
        tipo: "loja",
        url: p.data.fonte_url,
        acessado_em: p.data.data,
      }
    : undefined;
  let novo: Record<string, unknown>;
  if (p.data.moeda === "brl") {
    novo = withKey(
      atual.item,
      "preco_estimado_brl",
      {
        min: p.data.min,
        max: p.data.max,
        data: p.data.data,
        status: p.data.status,
        fontes: fonte ? [fonte] : [],
        ...(p.data.observacao ? { observacao: p.data.observacao } : {}),
      },
      ["preco_referencia_usd", "onde_comprar"],
    );
  } else {
    if (k.data === "ferramenta") {
      return { ok: false, erro: "Ferramentas usam preço em R$ (lojas brasileiras)." };
    }
    if (!fonte || !p.data.loja) {
      return {
        ok: false,
        erro: "Preço em US$ precisa da loja e do link da página (a conversão em R$ depende dele).",
      };
    }
    novo = withKey(
      atual.item,
      "preco_referencia_usd",
      {
        min: p.data.min,
        max: p.data.max,
        data: p.data.data,
        loja: p.data.loja,
        fontes: [fonte],
        ...(p.data.observacao ? { observacao: p.data.observacao } : {}),
      },
      ["onde_comprar"],
    );
  }
  return done(await updateCatalogItem({ kind: k.data, id, novo, versao }), "Preço salvo");
}

/** Tira o preço em R$ (o custo volta a usar a conversão do preço em US$, se houver). */
export async function removeBrlPriceAction(
  kind: string,
  id: string,
  versao: string,
): Promise<CatalogActionResult> {
  const bloqueio = await guard();
  if (bloqueio) return bloqueio;
  const k = kindSchema.safeParse(kind);
  if (!k.success || k.data === "empuxo") return { ok: false, erro: "Este item não tem preço." };
  const atual = readCatalogItem(k.data, id);
  if (!atual) return { ok: false, erro: "Item não encontrado." };
  if (atual.item.preco_estimado_brl === undefined) {
    return { ok: false, erro: "O item não tem preço em R$." };
  }
  const novo = Object.fromEntries(
    Object.entries(atual.item).filter(([chave]) => chave !== "preco_estimado_brl"),
  );
  return done(await updateCatalogItem({ kind: k.data, id, novo, versao }), "Preço em R$ removido");
}

const importFormSchema = z
  .object({
    usd_brl: z.coerce.number().positive("O câmbio precisa ser maior que zero."),
    data_cambio: isoDateSchema,
    fonte_url: optionalText,
    icms_min: z.coerce.number().min(0).max(100),
    icms_max: z.coerce.number().min(0).max(100),
    verificado_em: isoDateSchema,
  })
  .refine((p) => p.icms_max >= p.icms_min, {
    message: "O ICMS máximo precisa ser maior ou igual ao mínimo.",
  })
  .refine((p) => !p.fonte_url || p.fonte_url.startsWith("https://"), {
    message: "O link da fonte precisa começar com https://.",
  });

/** Câmbio, ICMS e data da conferência das regras de importação (SPEC B.6: parâmetro com data). */
export async function saveImportParamsAction(
  versao: string,
  form: unknown,
): Promise<CatalogActionResult> {
  const bloqueio = await guard();
  if (bloqueio) return bloqueio;
  const p = importFormSchema.safeParse(form);
  if (!p.success) {
    return {
      ok: false,
      erro: "Parâmetros inválidos.",
      problemas: p.error.issues.map((i) => i.message),
    };
  }
  const atual = readImportParams();
  if (!atual) return { ok: false, erro: "Falta o arquivo de parâmetros de importação." };
  const cambio = (atual.item.cambio ?? {}) as Record<string, unknown>;
  const fonteAnterior = (cambio.fonte ?? {}) as Record<string, unknown>;
  const novo = {
    ...atual.item,
    verificado_em: p.data.verificado_em,
    cambio: {
      ...cambio,
      usd_brl: p.data.usd_brl,
      data: p.data.data_cambio,
      fonte: p.data.fonte_url
        ? {
            titulo: `Banco Central do Brasil: PTAX (cotação de venda do dólar em ${p.data.data_cambio.split("-").reverse().join("/")})`,
            tipo: "documentacao_oficial",
            url: p.data.fonte_url,
            acessado_em: p.data.verificado_em,
          }
        : fonteAnterior,
    },
    icms_pct: [p.data.icms_min, p.data.icms_max],
  };
  return done(await updateImportParams({ novo, versao }), "Parâmetros de importação salvos");
}

/** Edita os parâmetros de importação inteiros em JSON (faixas do imposto, aviso, fontes). */
export async function saveImportParamsJsonAction(
  versao: string,
  texto: string,
): Promise<CatalogActionResult> {
  const bloqueio = await guard();
  if (bloqueio) return bloqueio;
  let novo: unknown;
  try {
    novo = JSON.parse(texto);
  } catch (error) {
    return {
      ok: false,
      erro: "O texto não é um JSON válido.",
      problemas: [(error as Error).message],
    };
  }
  return done(await updateImportParams({ novo, versao }), "Parâmetros de importação salvos");
}
