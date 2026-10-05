import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CATALOG_ROOT, loadDroneCatalog, readCatalogFiles } from "./load";
import {
  formatCatalogJson,
  readCatalogItem,
  readImportParams,
  updateCatalogItem,
  updateImportParams,
} from "./write";

/*
 * A página /catalogo grava nos arquivos JSON versionados. Estes testes usam uma CÓPIA do catálogo
 * real numa pasta temporária: nada aqui mexe nos arquivos do repositório.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "from-scratch-catalogo-"));
  cpSync(CATALOG_ROOT, root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const ler = (caminho: string) => readFileSync(path.join(root, ...caminho.split("/")), "utf8");

describe("formato canônico dos arquivos do catálogo", () => {
  it("todo arquivo do repositório já está no formato que a página grava (pnpm catalog:format)", async () => {
    for (const f of readCatalogFiles(CATALOG_ROOT)) {
      const canonico = await formatCatalogJson(
        JSON.parse(f.conteudo),
        path.join(CATALOG_ROOT, f.caminho),
      );
      expect(canonico, `${f.caminho} fora do formato canônico: rode pnpm catalog:format`).toBe(
        f.conteudo,
      );
    }
  });
});

describe("editar um item do catálogo", () => {
  const ID = "iflight-xing2-2207-1855kv";

  it("grava só o item editado (o resto do arquivo e os outros arquivos não mudam)", async () => {
    const antes = readCatalogFiles(root);
    const atual = readCatalogItem("componente", ID, root)!;
    const novo = {
      ...atual.item,
      preco_estimado_brl: {
        min: 110,
        max: 150,
        data: "2026-10-05",
        status: "estimativa",
        fontes: [],
      },
    };
    const r = await updateCatalogItem({
      kind: "componente",
      id: ID,
      novo,
      versao: atual.versao,
      root,
    });
    expect(r).toEqual({ ok: true, arquivo: atual.arquivo });

    const depois = readCatalogFiles(root);
    for (const f of antes) {
      const novoArquivo = depois.find((x) => x.caminho === f.caminho)!;
      if (f.caminho !== atual.arquivo) expect(novoArquivo.conteudo, f.caminho).toBe(f.conteudo);
    }
    // Só linhas novas (o preço); das antigas, no máximo a que ganhou a vírgula do JSON mudou.
    const linhasAntes = antes.find((x) => x.caminho === atual.arquivo)!.conteudo.split("\n");
    const linhasDepois = ler(atual.arquivo).split("\n");
    expect(linhasDepois.length).toBeGreaterThan(linhasAntes.length);
    const sumiram = linhasAntes.filter((l) => !linhasDepois.includes(l));
    expect(sumiram.length).toBeLessThanOrEqual(1);
    // O motor de cálculo já usa o preço novo.
    const { catalog } = loadDroneCatalog(root);
    expect(catalog.componentes.find((c) => c.id === ID)?.preco_estimado_brl?.min).toBe(110);
  });

  it("recusa item que não passa no schema e não toca no arquivo", async () => {
    const atual = readCatalogItem("componente", ID, root)!;
    const conteudo = ler(atual.arquivo);
    const r = await updateCatalogItem({
      kind: "componente",
      id: ID,
      novo: { ...atual.item, massa_g: -5 },
      root,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problemas.join(" ")).toMatch(/massa_g/);
    expect(ler(atual.arquivo)).toBe(conteudo);
  });

  it("recusa marcar como verificado sem fonte com link e data (regra do catálogo inteiro)", async () => {
    const atual = readCatalogItem("componente", "conector-xt60-rabicho", root)!;
    const r = await updateCatalogItem({
      kind: "componente",
      id: "conector-xt60-rabicho",
      novo: { ...atual.item, status_verificacao: "verificado", fontes: [] },
      root,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problemas.join(" ")).toMatch(/verificado sem fonte/);
  });

  it("recusa se o item mudou no arquivo depois de aberto, e não deixa trocar o id", async () => {
    const atual = readCatalogItem("componente", ID, root)!;
    const velha = await updateCatalogItem({
      kind: "componente",
      id: ID,
      novo: atual.item,
      versao: "0000000000000000",
      root,
    });
    expect(velha.ok).toBe(false);
    const outroId = await updateCatalogItem({
      kind: "componente",
      id: ID,
      novo: { ...atual.item, id: "outro-id" },
      root,
    });
    expect(outroId.ok).toBe(false);
    if (!outroId.ok) expect(outroId.problemas.join(" ")).toMatch(/id não pode mudar/);
  });

  it("item inexistente vira problema, não exceção", async () => {
    const r = await updateCatalogItem({ kind: "ferramenta", id: "nao-existe", novo: {}, root });
    expect(r).toEqual({ ok: false, problemas: ['Item "nao-existe" não encontrado no catálogo.'] });
  });
});

describe("parâmetros de importação", () => {
  it("atualiza o câmbio com data e fonte, e o custo em R$ muda junto", async () => {
    const atual = readImportParams(root)!;
    const antes = loadDroneCatalog(root).catalog.importacao!.cambio.usd_brl;
    const cambio = atual.item.cambio as Record<string, unknown>;
    const r = await updateImportParams({
      novo: { ...atual.item, cambio: { ...cambio, usd_brl: 5.5, data: "2026-10-05" } },
      versao: atual.versao,
      root,
    });
    expect(r.ok).toBe(true);
    const depois = loadDroneCatalog(root).catalog.importacao!.cambio;
    expect(depois.usd_brl).toBe(5.5);
    expect(depois.usd_brl).not.toBe(antes);
  });

  it("recusa ICMS fora de 0–100%", async () => {
    const atual = readImportParams(root)!;
    const r = await updateImportParams({ novo: { ...atual.item, icms_pct: [17, 200] }, root });
    expect(r.ok).toBe(false);
  });
});
