import { count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  parts,
  TEST_ARCHETYPE,
  TEST_FIRMWARE,
  THRUST_TABLE,
} from "@/domain/categories/drone/__fixtures__/builds";
import type { LoadedCatalog } from "@/server/catalog/load";

import { openDatabase } from "./client";
import {
  catalogoMeta,
  componentes,
  dronesProntos,
  projetos,
  tabelasEmpuxo,
  termosGlossario,
  versoesProjeto,
} from "./schema";
import { syncDroneCatalog, syncGlossary } from "./sync";

const PRONTO = {
  id: "pronto-teste",
  arquetipo_id: TEST_ARCHETYPE.id,
  marca: "Teste",
  modelo: "Pronto",
  tipo: "RTF" as const,
  descricao_leiga: "Drone pronto de teste.",
  cobre_categorias: ["frame"],
  preco_estimado_brl: {
    min: 100,
    max: 200,
    data: "2026-10-04",
    status: "estimativa" as const,
    fontes: [],
  },
  onde_comprar: [{ tipo_loja: "fabricante" as const, termo_busca: "drone pronto" }],
  fontes: [{ titulo: "Fonte de teste", tipo: "comunidade" as const }],
  status_verificacao: "nao_verificado" as const,
  diferencas: [],
  notas: [],
};

function loaded(hash: string, extra = 0): LoadedCatalog {
  const extras = Array.from({ length: extra }, (_, i) => ({ ...parts.gps(), id: `gps-${i}` }));
  return {
    hash,
    arquivos: [],
    catalog: {
      componentes: [parts.motor(), parts.prop(), ...extras],
      empuxo: [THRUST_TABLE],
      ferramentas: [],
      arquetipos: [{ ...TEST_ARCHETYPE, perfil_firmware: TEST_FIRMWARE.id }],
      perfis_firmware: [TEST_FIRMWARE],
      prontos: [PRONTO],
    },
  };
}

const total = (
  db: ReturnType<typeof openDatabase>,
  table: typeof componentes | typeof tabelasEmpuxo,
) => db.select({ n: count() }).from(table).get()?.n;

describe("banco local", () => {
  it("aplica as migrações num banco novo", () => {
    const db = openDatabase(":memory:");
    expect(total(db, componentes)).toBe(0);
  });

  it("espelha o catálogo e só reescreve quando o hash muda", () => {
    const db = openDatabase(":memory:");
    expect(syncDroneCatalog(db, loaded("h1"))).toMatchObject({ mudou: true, itens: 6 });
    expect(total(db, componentes)).toBe(2);
    expect(total(db, tabelasEmpuxo)).toBe(1);
    expect(db.select().from(dronesProntos).get()?.dados).toEqual(PRONTO);

    expect(syncDroneCatalog(db, loaded("h1", 3)).mudou).toBe(false);
    expect(total(db, componentes)).toBe(2);

    expect(syncDroneCatalog(db, loaded("h2", 3)).mudou).toBe(true);
    expect(total(db, componentes)).toBe(5);
    expect(db.select().from(catalogoMeta).where(eq(catalogoMeta.fonte, "drone")).get()?.hash).toBe(
      "h2",
    );
  });

  it("guarda o item inteiro validado para reler sem perder campos", () => {
    const db = openDatabase(":memory:");
    syncDroneCatalog(db, loaded("h1"));
    const motor = db.select().from(componentes).where(eq(componentes.id, "motor-teste")).get();
    expect(motor?.dados).toEqual(parts.motor());
    expect(motor?.categoria).toBe("motor");
  });

  it("chave estrangeira ligada: tabela de empuxo sem motor é recusada", () => {
    const db = openDatabase(":memory:");
    const semMotor = loaded("h1");
    semMotor.catalog.componentes = [parts.prop()];
    expect(() => syncDroneCatalog(db, semMotor)).toThrow();
    // A transação desfaz tudo: nada fica pela metade.
    expect(total(db, componentes)).toBe(0);
  });

  it("espelha o glossário", () => {
    const db = openDatabase(":memory:");
    syncGlossary(db, {
      hash: "g1",
      problemas: [],
      termos: [{ termo: "KV", explicacao: "rpm por volt", relacionados: ["Hélice"] }],
    });
    expect(db.select().from(termosGlossario).all()).toEqual([
      { termo: "KV", explicacao: "rpm por volt", analogia: null, relacionados: ["Hélice"] },
    ]);
  });

  it("apagar um projeto apaga as versões dele (cascata)", () => {
    const db = openDatabase(":memory:");
    db.insert(projetos)
      .values({ id: "p1", titulo: "Teste", prompt_original: "um drone", atualizado_em: new Date() })
      .run();
    db.insert(versoesProjeto)
      .values({ projeto_id: "p1", numero: 1, motivo: "criação", catalogo_hash: "h1" })
      .run();
    const versao = db.select().from(versoesProjeto).get();
    expect(versao?.criado_em).toBeInstanceOf(Date);
    expect(Number.isInteger(versao?.criado_em.getTime())).toBe(true);
    db.delete(projetos).where(eq(projetos.id, "p1")).run();
    expect(db.select().from(versoesProjeto).all()).toEqual([]);
  });
});
