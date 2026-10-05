import { createHash } from "node:crypto";
import { renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { GLOBAL_ALERT_IDS } from "@/domain/categories/drone/safety";
import {
  componentSchema,
  readyMadeSchema,
  thrustDataSchema,
  toolSchema,
} from "@/domain/categories/drone/schema";
import { importParamsSchema } from "@/domain/core/importacao";

import {
  CATALOG_ROOT,
  CatalogError,
  type CatalogFile,
  parseCatalogFiles,
  readCatalogFiles,
} from "./load";

/*
 * Gravação do catálogo pela página /catalogo (SPEC B.6, ADR-0015 e ADR-0025).
 *
 * O catálogo continua nos arquivos JSON versionados: cada edição troca o item no arquivo dele e
 * vira um `git diff` legível. Antes de gravar, o catálogo INTEIRO é validado com a mudança (schema
 * zod + checkCatalog): uma edição que quebraria o motor de cálculo não chega ao disco. A escrita é
 * atômica (arquivo temporário + renomear) e sai no mesmo formato do Prettier do projeto, para o
 * diff mostrar só o que mudou.
 */

export const CATALOG_KINDS = ["componente", "empuxo", "ferramenta", "pronto"] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

const FOLDER: Record<CatalogKind, string> = {
  componente: "componentes",
  empuxo: "empuxo",
  ferramenta: "ferramentas",
  pronto: "prontos",
};

const SCHEMA: Record<CatalogKind, z.ZodType> = {
  componente: componentSchema,
  empuxo: thrustDataSchema,
  ferramenta: toolSchema,
  pronto: readyMadeSchema,
};

export const IMPORT_PARAMS_FILE = "parametros/importacao.json";

export type WriteResult = { ok: true; arquivo: string } | { ok: false; problemas: string[] };

/**
 * Formato canônico dos JSON do catálogo: 2 espaços + o Prettier do projeto (só JSON, sem plugins).
 * A configuração vem sempre da raiz do projeto (.prettierrc.json), mesmo quando o catálogo está
 * em outra pasta (FROM_SCRATCH_CATALOG_DIR): o arquivo precisa sair igual ao que `pnpm format`
 * produziria no repositório.
 */
export async function formatCatalogJson(data: unknown): Promise<string> {
  const texto = `${JSON.stringify(data, null, 2)}\n`;
  try {
    const prettier = await import("prettier");
    const options = (await prettier.resolveConfig(path.join(process.cwd(), "catalogo.json"))) ?? {};
    return await prettier.format(texto, { ...options, parser: "json", plugins: [] });
  } catch {
    // Sem o Prettier o conteúdo continua válido; só a formatação pode diferir.
    return texto;
  }
}

/** Versão de um item (para recusar a gravação se ele mudou desde que a página foi aberta). */
export function itemVersion(item: unknown): string {
  return createHash("sha256").update(JSON.stringify(item)).digest("hex").slice(0, 16);
}

export type LocatedItem = { arquivo: string; indice: number; item: Record<string, unknown> };

/** Acha o arquivo e a posição de um item (pelo id) na pasta do tipo. */
export function locateItem(
  files: readonly CatalogFile[],
  kind: CatalogKind,
  id: string,
): LocatedItem | undefined {
  const prefixo = `${FOLDER[kind]}/`;
  for (const f of files) {
    if (!f.caminho.startsWith(prefixo)) continue;
    const lista: unknown = JSON.parse(f.conteudo);
    if (!Array.isArray(lista)) continue;
    const indice = lista.findIndex(
      (x) => typeof x === "object" && x !== null && (x as { id?: unknown }).id === id,
    );
    if (indice >= 0) {
      return { arquivo: f.caminho, indice, item: lista[indice] as Record<string, unknown> };
    }
  }
  return undefined;
}

/** O item como está no arquivo (sem os padrões que o schema preenche) e a versão dele. */
export function readCatalogItem(
  kind: CatalogKind,
  id: string,
  root = CATALOG_ROOT,
): { item: Record<string, unknown>; versao: string; arquivo: string } | undefined {
  const achado = locateItem(readCatalogFiles(root), kind, id);
  if (!achado) return undefined;
  return { item: achado.item, versao: itemVersion(achado.item), arquivo: achado.arquivo };
}

function zodProblems(error: z.ZodError): string[] {
  return error.issues.map((i) =>
    i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message,
  );
}

/** Valida o catálogo inteiro com um arquivo trocado; devolve os problemas (vazio = ok). */
function validateWith(files: readonly CatalogFile[], caminho: string, conteudo: string): string[] {
  const trocados = files.map((f) => (f.caminho === caminho ? { caminho, conteudo } : f));
  try {
    parseCatalogFiles(trocados, { alertasGlobais: GLOBAL_ALERT_IDS });
    return [];
  } catch (error) {
    if (error instanceof CatalogError) return error.problemas;
    throw error;
  }
}

function writeAtomic(root: string, caminho: string, conteudo: string) {
  const destino = path.join(root, ...caminho.split("/"));
  const temporario = `${destino}.${process.pid}.tmp`;
  writeFileSync(temporario, conteudo, "utf8");
  renameSync(temporario, destino);
}

/**
 * Troca um item do catálogo. `novo` é o item como deve ficar no arquivo (sem precisar repetir os
 * padrões do schema). `versao` (de readCatalogItem) evita sobrescrever uma edição feita por fora
 * (por exemplo, no editor de texto) depois que a página foi aberta.
 */
export async function updateCatalogItem(opcoes: {
  kind: CatalogKind;
  id: string;
  novo: unknown;
  versao?: string;
  root?: string;
}): Promise<WriteResult> {
  const root = opcoes.root ?? CATALOG_ROOT;
  const files = readCatalogFiles(root);
  const achado = locateItem(files, opcoes.kind, opcoes.id);
  if (!achado) return { ok: false, problemas: [`Item "${opcoes.id}" não encontrado no catálogo.`] };
  if (opcoes.versao && opcoes.versao !== itemVersion(achado.item)) {
    return {
      ok: false,
      problemas: [
        "Este item mudou no arquivo depois que você abriu a página. Recarregue para ver a versão atual antes de salvar.",
      ],
    };
  }
  const validado = SCHEMA[opcoes.kind].safeParse(opcoes.novo);
  if (!validado.success) return { ok: false, problemas: zodProblems(validado.error) };
  const novoId = (opcoes.novo as { id?: unknown }).id;
  if (novoId !== opcoes.id) {
    return {
      ok: false,
      problemas: [
        `O id não pode mudar aqui ("${opcoes.id}"): outras partes do catálogo apontam para ele.`,
      ],
    };
  }
  const arquivo = files.find((f) => f.caminho === achado.arquivo);
  if (!arquivo) return { ok: false, problemas: [`Arquivo ${achado.arquivo} sumiu.`] };
  const lista = JSON.parse(arquivo.conteudo) as unknown[];
  lista[achado.indice] = opcoes.novo;
  const conteudo = await formatCatalogJson(lista);
  const problemas = validateWith(files, achado.arquivo, conteudo);
  if (problemas.length > 0) return { ok: false, problemas };
  writeAtomic(root, achado.arquivo, conteudo);
  return { ok: true, arquivo: achado.arquivo };
}

/** Os parâmetros de importação como estão no arquivo, com a versão. */
export function readImportParams(
  root = CATALOG_ROOT,
): { item: Record<string, unknown>; versao: string } | undefined {
  const f = readCatalogFiles(root).find((x) => x.caminho === IMPORT_PARAMS_FILE);
  if (!f) return undefined;
  const item = JSON.parse(f.conteudo) as Record<string, unknown>;
  return { item, versao: itemVersion(item) };
}

/** Troca os parâmetros de importação (câmbio, ICMS, faixas do imposto). */
export async function updateImportParams(opcoes: {
  novo: unknown;
  versao?: string;
  root?: string;
}): Promise<WriteResult> {
  const root = opcoes.root ?? CATALOG_ROOT;
  const files = readCatalogFiles(root);
  const atual = files.find((x) => x.caminho === IMPORT_PARAMS_FILE);
  if (!atual) return { ok: false, problemas: [`Falta ${IMPORT_PARAMS_FILE} no catálogo.`] };
  if (opcoes.versao && opcoes.versao !== itemVersion(JSON.parse(atual.conteudo))) {
    return {
      ok: false,
      problemas: [
        "Os parâmetros mudaram no arquivo depois que você abriu a página. Recarregue antes de salvar.",
      ],
    };
  }
  const validado = importParamsSchema.safeParse(opcoes.novo);
  if (!validado.success) return { ok: false, problemas: zodProblems(validado.error) };
  const conteudo = await formatCatalogJson(opcoes.novo);
  const problemas = validateWith(files, IMPORT_PARAMS_FILE, conteudo);
  if (problemas.length > 0) return { ok: false, problemas };
  writeAtomic(root, IMPORT_PARAMS_FILE, conteudo);
  return { ok: true, arquivo: IMPORT_PARAMS_FILE };
}
