import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

/** Renomear falha `vezes` seguidas com `codigo` (simula o Windows com o arquivo preso). */
const renomear = vi.hoisted(() => ({ vezes: 0, codigo: "EPERM" }));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return {
    ...real,
    renameSync: (...args: Parameters<typeof real.renameSync>) => {
      if (renomear.vezes > 0) {
        renomear.vezes--;
        throw Object.assign(new Error("arquivo ocupado (simulado)"), { code: renomear.codigo });
      }
      real.renameSync(...args);
    },
  };
});

let root: string;

beforeEach(() => {
  renomear.vezes = 0;
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
      const canonico = await formatCatalogJson(JSON.parse(f.conteudo));
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
    // O preço entra antes do preço em US$ (como a página faz), para não mexer em outras linhas.
    const novo = Object.fromEntries(
      Object.entries(atual.item).flatMap(([k, v]) =>
        k === "preco_referencia_usd"
          ? [
              [
                "preco_estimado_brl",
                { min: 110, max: 150, data: "2026-10-05", status: "estimativa", fontes: [] },
              ],
              [k, v],
            ]
          : [[k, v]],
      ),
    );
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
    // Nenhuma linha antiga mudou (a pasta temporária fica fora do projeto: a formatação tem de
    // seguir a configuração da raiz mesmo assim).
    expect(linhasAntes.filter((l) => !linhasDepois.includes(l))).toEqual([]);
    expect(linhasDepois.length - linhasAntes.length).toBe(7);
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

describe("gravação no Windows (arquivo preso por antivírus ou outro programa)", () => {
  const ID = "conector-xt60-rabicho";
  const temporarios = () =>
    readdirSync(path.join(root, "componentes")).filter((f) => f.endsWith(".tmp"));

  it("arquivo ocupado por instantes: tenta de novo e grava", async () => {
    const atual = readCatalogItem("componente", ID, root)!;
    renomear.codigo = "EPERM";
    renomear.vezes = 2;
    const r = await updateCatalogItem({
      kind: "componente",
      id: ID,
      novo: { ...atual.item, massa_g: 9 },
      root,
    });
    expect(r.ok).toBe(true);
    expect(renomear.vezes).toBe(0); // as duas falhas aconteceram e a terceira tentativa gravou
    expect(readCatalogItem("componente", ID, root)!.item.massa_g).toBe(9);
    expect(temporarios()).toEqual([]);
  });

  it("erro que não passa sozinho: não grava, não deixa temporário e explica", async () => {
    const atual = readCatalogItem("componente", ID, root)!;
    const conteudo = ler(atual.arquivo);
    renomear.codigo = "EXDEV";
    renomear.vezes = 1;
    const r = await updateCatalogItem({
      kind: "componente",
      id: ID,
      novo: { ...atual.item, massa_g: 9 },
      root,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problemas.join(" ")).toMatch(/Não consegui gravar .*\(EXDEV\)/);
    expect(ler(atual.arquivo)).toBe(conteudo);
    expect(temporarios()).toEqual([]);
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
