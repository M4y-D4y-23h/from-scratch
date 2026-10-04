import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  parts,
  TEST_ARCHETYPE,
  TEST_FIRMWARE,
  THRUST_TABLE,
} from "@/domain/categories/drone/__fixtures__/builds";

import {
  CatalogError,
  type CatalogFile,
  hashCatalog,
  loadDroneCatalog,
  parseCatalogFiles,
} from "./load";

const json = (value: unknown) => JSON.stringify(value, null, 2);

// O arquivo do arquétipo pode vir sem passos (eles ficam em passos/<id>.json).
const archetypeFile = { ...TEST_ARCHETYPE, perfil_firmware: TEST_FIRMWARE.id, passos: [] };

function validFiles(): CatalogFile[] {
  return [
    { caminho: "componentes/propulsao.json", conteudo: json([parts.motor(), parts.prop()]) },
    { caminho: "empuxo/teste.json", conteudo: json([THRUST_TABLE]) },
    { caminho: "arquetipos/a1-gps-filmagem.json", conteudo: json(archetypeFile) },
    { caminho: "firmware/arducopter-teste.json", conteudo: json(TEST_FIRMWARE) },
  ];
}

describe("parseCatalogFiles", () => {
  it("monta o catálogo a partir das pastas", () => {
    const { catalog, arquivos } = parseCatalogFiles(validFiles());
    expect(catalog.componentes.map((c) => c.id)).toEqual(["motor-teste", "helice-teste"]);
    expect(catalog.empuxo).toHaveLength(1);
    expect(catalog.arquetipos[0]?.passos).toEqual([]);
    expect(catalog.perfis_firmware[0]?.id).toBe("arducopter-teste");
    expect(arquivos).toHaveLength(4);
  });

  it("junta os passos de passos/<id>.json ao arquétipo", () => {
    const passo = {
      id: "medir-curto",
      titulo: "Medir curto-circuito",
      objetivo: "Evitar fumaça no primeiro power-on.",
      por_que_importa: "Um curto queima a placa.",
      tempo_min: [5, 10],
      dominios: { eletronica_solda: 1 },
      como_saber_que_deu_certo: ["O multímetro não apita entre + e -."],
      local: "em_casa",
    };
    const files = [
      ...validFiles(),
      { caminho: "passos/a1-gps-filmagem.json", conteudo: json([passo]) },
    ];
    expect(parseCatalogFiles(files).catalog.arquetipos[0]?.passos.map((p) => p.id)).toEqual([
      "medir-curto",
    ]);
  });

  it("junta todos os problemas, com o nome do arquivo", () => {
    const files: CatalogFile[] = [
      ...validFiles(),
      { caminho: "componentes/quebrado.json", conteudo: "{ isto não é json" },
      { caminho: "componentes/invalido.json", conteudo: json([{ id: "X Y", categoria: "motor" }]) },
      { caminho: "passos/inexistente.json", conteudo: "[]" },
      { caminho: "outra-pasta/x.json", conteudo: "[]" },
    ];
    try {
      parseCatalogFiles(files);
      expect.unreachable("deveria ter lançado CatalogError");
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogError);
      const problemas = (error as CatalogError).problemas.join("\n");
      expect(problemas).toContain("componentes/quebrado.json: JSON inválido");
      expect(problemas).toContain("componentes/invalido.json em 0.id");
      expect(problemas).toContain('arquétipo "inexistente" não existe');
      expect(problemas).toContain("outra-pasta/x.json: pasta desconhecida");
    }
  });

  it("o nome do arquivo do arquétipo precisa ser o id", () => {
    const files = validFiles().map((f) =>
      f.caminho.startsWith("arquetipos/") ? { ...f, caminho: "arquetipos/outro-nome.json" } : f,
    );
    expect(() => parseCatalogFiles(files)).toThrow(/nome do arquivo deve ser o id/);
  });
});

describe("hashCatalog", () => {
  it("muda quando o conteúdo muda e não depende da ordem de leitura", () => {
    const files = validFiles();
    const reversed = [...files].reverse().sort((a, b) => (a.caminho < b.caminho ? -1 : 1));
    expect(hashCatalog(reversed)).toBe(
      hashCatalog([...files].sort((a, b) => (a.caminho < b.caminho ? -1 : 1))),
    );
    const changed = files.map((f, i) => (i === 0 ? { ...f, conteudo: `${f.conteudo} ` } : f));
    expect(hashCatalog(changed)).not.toBe(hashCatalog(files));
  });
});

describe("loadDroneCatalog (arquivos no disco)", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("lê subpastas e trata CRLF (Windows) igual a LF", () => {
    dir = mkdtempSync(path.join(tmpdir(), "catalogo-"));
    const write = (file: CatalogFile, crlf: boolean) => {
      const full = path.join(dir!, ...file.caminho.split("/"));
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, crlf ? file.conteudo.replace(/\n/g, "\r\n") : file.conteudo);
    };
    for (const f of validFiles()) write(f, true);
    const comCrlf = loadDroneCatalog(dir);
    for (const f of validFiles()) write(f, false);
    const comLf = loadDroneCatalog(dir);
    expect(comCrlf.catalog.componentes).toHaveLength(2);
    expect(comCrlf.hash).toBe(comLf.hash);
    expect(comLf.arquivos).toContain("componentes/propulsao.json");
  });

  it("pasta inexistente vira catálogo vazio", () => {
    const vazio = loadDroneCatalog(path.join(tmpdir(), "nao-existe-catalogo-xyz"));
    expect(vazio.catalog.componentes).toEqual([]);
  });
});
