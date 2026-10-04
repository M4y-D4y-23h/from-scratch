import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  checkCatalog,
  type CheckOptions,
  type DroneCatalog,
} from "@/domain/categories/drone/catalog";
import { importParamsSchema } from "@/domain/core/importacao";
import {
  archetypeSchema,
  buildStepTemplateSchema,
  componentSchema,
  firmwareProfileSchema,
  thrustDataSchema,
  toolSchema,
} from "@/domain/categories/drone/schema";

/*
 * Lê o catálogo curado de data/catalog/drone (fonte da verdade, versionada no git; ADR-0015).
 *
 * Organização das pastas (cada arquivo é validado pelo seu schema):
 *   componentes/*.json   lista de peças
 *   empuxo/*.json        lista de tabelas de empuxo
 *   ferramentas/*.json   lista de ferramentas, consumíveis e EPI
 *   arquetipos/*.json    um arquétipo por arquivo (sem os passos)
 *   passos/<id>.json     lista de passos do arquétipo <id>
 *   firmware/*.json      um perfil de parâmetros por arquivo
 *   parametros/importacao.json   câmbio e tributos de importação (com data e fonte)
 */

export const CATALOG_ROOT = path.resolve(process.cwd(), "data", "catalog", "drone");

export type CatalogFile = {
  /** Caminho relativo com "/" (igual no Windows e no Linux). */ caminho: string;
  conteudo: string;
};

export class CatalogError extends Error {
  constructor(readonly problemas: string[]) {
    super(`Catálogo com ${problemas.length} problema(s):\n- ${problemas.join("\n- ")}`);
    this.name = "CatalogError";
  }
}

function listJsonFiles(root: string, dir = root): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listJsonFiles(root, full));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(full);
  }
  return files;
}

/** Lê os arquivos do catálogo em ordem estável, com finais de linha normalizados (LF). */
export function readCatalogFiles(root = CATALOG_ROOT): CatalogFile[] {
  return listJsonFiles(root)
    .map((full) => ({
      caminho: path.relative(root, full).split(path.sep).join("/"),
      conteudo: readFileSync(full, "utf8").replace(/\r\n/g, "\n"),
    }))
    .sort((a, b) => (a.caminho < b.caminho ? -1 : a.caminho > b.caminho ? 1 : 0));
}

/** Impressão digital do catálogo: muda quando qualquer arquivo muda (usada para sincronizar o banco). */
export function hashCatalog(files: readonly CatalogFile[]): string {
  const hash = createHash("sha256");
  for (const f of files) hash.update(`${f.caminho}\n${f.conteudo}\n`);
  return hash.digest("hex");
}

function parseFile<T>(file: CatalogFile, schema: z.ZodType<T>, problemas: string[]): T | undefined {
  let json: unknown;
  try {
    json = JSON.parse(file.conteudo);
  } catch (error) {
    problemas.push(`${file.caminho}: JSON inválido (${(error as Error).message})`);
    return undefined;
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const onde = issue.path.length > 0 ? ` em ${issue.path.join(".")}` : "";
      problemas.push(`${file.caminho}${onde}: ${issue.message}`);
    }
    return undefined;
  }
  return result.data;
}

const folderOf = (caminho: string) => caminho.split("/")[0] ?? "";
const baseName = (caminho: string) => path.posix.basename(caminho, ".json");

export type LoadedCatalog = {
  catalog: DroneCatalog;
  hash: string;
  arquivos: string[];
};

/** Monta e valida o catálogo a partir dos arquivos. Lança CatalogError com todos os problemas. */
export function parseCatalogFiles(
  files: readonly CatalogFile[],
  options: CheckOptions = {},
): LoadedCatalog {
  const problemas: string[] = [];
  const catalog: DroneCatalog = {
    componentes: [],
    empuxo: [],
    ferramentas: [],
    arquetipos: [],
    perfis_firmware: [],
  };
  const passosPorArquetipo = new Map<string, DroneCatalog["arquetipos"][number]["passos"]>();
  const arquetiposSemPassos: Array<{ caminho: string; dados: DroneCatalog["arquetipos"][number] }> =
    [];

  for (const file of files) {
    switch (folderOf(file.caminho)) {
      case "componentes":
        catalog.componentes.push(...(parseFile(file, z.array(componentSchema), problemas) ?? []));
        break;
      case "empuxo":
        catalog.empuxo.push(...(parseFile(file, z.array(thrustDataSchema), problemas) ?? []));
        break;
      case "ferramentas":
        catalog.ferramentas.push(...(parseFile(file, z.array(toolSchema), problemas) ?? []));
        break;
      case "arquetipos": {
        const dados = parseFile(
          file,
          archetypeSchema.extend({ passos: z.array(buildStepTemplateSchema).default([]) }),
          problemas,
        );
        if (dados) arquetiposSemPassos.push({ caminho: file.caminho, dados });
        break;
      }
      case "passos": {
        const passos = parseFile(file, z.array(buildStepTemplateSchema), problemas);
        if (passos) passosPorArquetipo.set(baseName(file.caminho), passos);
        break;
      }
      case "parametros": {
        if (baseName(file.caminho) !== "importacao") {
          problemas.push(`${file.caminho}: só existe parametros/importacao.json`);
          break;
        }
        catalog.importacao = parseFile(file, importParamsSchema, problemas);
        break;
      }
      case "firmware": {
        const perfil = parseFile(file, firmwareProfileSchema, problemas);
        if (perfil) catalog.perfis_firmware.push(perfil);
        break;
      }
      default:
        problemas.push(
          `${file.caminho}: pasta desconhecida (veja a organização em src/server/catalog/load.ts)`,
        );
    }
  }

  for (const { caminho, dados } of arquetiposSemPassos) {
    if (baseName(caminho) !== dados.id)
      problemas.push(`${caminho}: o nome do arquivo deve ser o id (${dados.id})`);
    catalog.arquetipos.push({
      ...dados,
      passos: [...dados.passos, ...(passosPorArquetipo.get(dados.id) ?? [])],
    });
    passosPorArquetipo.delete(dados.id);
  }
  for (const id of passosPorArquetipo.keys())
    problemas.push(`passos/${id}.json: arquétipo "${id}" não existe`);

  problemas.push(...checkCatalog(catalog, options));
  if (problemas.length > 0) throw new CatalogError(problemas);
  return { catalog, hash: hashCatalog(files), arquivos: files.map((f) => f.caminho) };
}

export function loadDroneCatalog(root = CATALOG_ROOT, options: CheckOptions = {}): LoadedCatalog {
  return parseCatalogFiles(readCatalogFiles(root), options);
}
