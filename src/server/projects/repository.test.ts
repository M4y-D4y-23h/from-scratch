import { describe, expect, it } from "vitest";

import { applySwaps, choiceFromBuild } from "@/domain/categories/drone/swap";
import { loadDroneCatalog } from "@/server/catalog/load";
import { openDatabase } from "@/server/db/client";
import { referenceBuild, snapshotFor } from "@/server/project-view/view";

import {
  addVersion,
  createProject,
  deleteProject,
  getProject,
  getVersion,
  listProjects,
  listVersions,
  renameProject,
} from "./repository";

const loaded = loadDroneCatalog();

function snapshotOf(choice: ReturnType<typeof choiceFromBuild>) {
  const r = snapshotFor(choice, { loaded });
  if ("erro" in r) throw new Error(r.erro);
  return r.snapshot;
}

function referenceChoice() {
  const ref = referenceBuild(loaded, "a1-gps-filmagem", "economica");
  if (!ref) throw new Error("sem build de referência");
  return { ...ref, choice: choiceFromBuild(ref.build, "economica") };
}

describe("projetos e versões (SPEC B.5: toda alteração gera nova versão)", () => {
  it("cria o projeto com a versão 1 e acrescenta a versão 2 ao trocar uma peça", () => {
    const db = openDatabase(":memory:");
    const { archetype, choice } = referenceChoice();
    const id = createProject(
      db,
      {
        titulo: "Meu drone com GPS",
        versao: {
          motivo: "Build de referência",
          catalogo_hash: loaded.hash,
          snapshot: snapshotOf(choice),
        },
      },
      new Date("2026-10-05T10:00:00Z"),
    );
    const trocado = applySwaps(choice, archetype, [
      { slot: "fc", componente_id: "holybro-pixhawk-6c-plastico" },
    ]);
    const numero = addVersion(
      db,
      id,
      { motivo: "Trocou a FC", catalogo_hash: loaded.hash, snapshot: snapshotOf(trocado) },
      new Date("2026-10-05T11:00:00Z"),
    );
    expect(numero).toBe(2);
    expect(getProject(db, id)?.versao_atual).toBe(2);
    expect(listVersions(db, id).map((v) => [v.numero, v.motivo])).toEqual([
      [2, "Trocou a FC"],
      [1, "Build de referência"],
    ]);
    // A versão atual guarda a escolha nova e a cópia das peças; a 1 continua intacta.
    const atual = getVersion(db, id)!;
    expect(atual.escolha.itens.find((i) => i.slot === "fc")?.componente_id).toBe(
      "holybro-pixhawk-6c-plastico",
    );
    expect(atual.pecas.some((c) => c.id === "holybro-pixhawk-6c-plastico")).toBe(true);
    expect(getVersion(db, id, 1)!.escolha).toEqual(choice);
  });

  it("lista do mais recente para o mais antigo, com arquétipo e faixa", () => {
    const db = openDatabase(":memory:");
    const { choice } = referenceChoice();
    const versao = { motivo: "v1", catalogo_hash: loaded.hash, snapshot: snapshotOf(choice) };
    const a = createProject(db, { titulo: "A", versao }, new Date("2026-10-01T00:00:00Z"));
    const b = createProject(db, { titulo: "B", versao }, new Date("2026-10-02T00:00:00Z"));
    expect(listProjects(db).map((p) => p.id)).toEqual([b, a]);
    expect(listProjects(db)[0]).toMatchObject({
      titulo: "B",
      arquetipo_id: "a1-gps-filmagem",
      faixa_origem: "economica",
    });
  });

  it("renomeia e apaga (as versões vão junto)", () => {
    const db = openDatabase(":memory:");
    const { choice } = referenceChoice();
    const id = createProject(db, {
      titulo: "Antigo",
      versao: { motivo: "v1", catalogo_hash: loaded.hash, snapshot: snapshotOf(choice) },
    });
    expect(renameProject(db, id, "Novo nome")).toBe(true);
    expect(getProject(db, id)?.titulo).toBe("Novo nome");
    expect(deleteProject(db, id)).toBe(true);
    expect(getProject(db, id)).toBeUndefined();
    expect(listVersions(db, id)).toEqual([]);
  });

  it("versão inexistente ou projeto inexistente: undefined (sem exceção)", () => {
    const db = openDatabase(":memory:");
    expect(getVersion(db, "nao-existe")).toBeUndefined();
    expect(() => addVersion(db, "nao-existe", {} as never)).toThrow(/não existe/);
  });
});
