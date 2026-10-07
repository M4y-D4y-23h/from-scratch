import { describe, expect, it } from "vitest";

import { guideState } from "@/domain/categories/drone/guide";
import { choiceFromBuild } from "@/domain/categories/drone/swap";
import { loadDroneCatalog } from "@/server/catalog/load";
import { openDatabase } from "@/server/db/client";
import { referenceBuild, snapshotFor } from "@/server/project-view/view";
import { doneCounts, getProgress } from "@/server/projects/progress";
import { createProject, deleteProject } from "@/server/projects/repository";

import { applyGuideAction, currentSteps } from "./service";

/*
 * O guia gravado no banco (SPEC B.13 e aceite da Fase 5): percorrer um projeto do passo 1 ao
 * fim, com os checklists de segurança conferidos no servidor.
 */

const loaded = loadDroneCatalog();

function novoProjeto(arquetipo = "a3-tiny-whoop") {
  const db = openDatabase(":memory:");
  const ref = referenceBuild(loaded, arquetipo, "economica");
  if (!ref) throw new Error("sem referência");
  const r = snapshotFor(choiceFromBuild(ref.build, "economica"), { loaded });
  if ("erro" in r) throw new Error(r.erro);
  const id = createProject(db, {
    titulo: "Guia",
    versao: { motivo: "teste", catalogo_hash: loaded.hash, snapshot: r.snapshot },
  });
  const passos = currentSteps(db, loaded, id);
  if ("erro" in passos) throw new Error(passos.erro);
  return { db, id, passos };
}

describe("progresso do guia no banco", () => {
  it("percorre o Tiny Whoop do passo 1 ao fim, com todos os checklists", () => {
    const { db, id, passos } = novoProjeto();
    for (const passo of passos) {
      if (passo.checkpoint) {
        const c = applyGuideAction(db, loaded, id, {
          tipo: "confirmar",
          passo_id: passo.id,
          marcados: passo.checkpoint.itens,
        });
        expect(c.ok, passo.id).toBe(true);
      }
      const r = applyGuideAction(db, loaded, id, { tipo: "feito", passo_id: passo.id });
      expect(r, passo.id).toMatchObject({ ok: true });
    }
    const estado = guideState(passos, getProgress(db, id));
    expect(estado.concluido).toBe(true);
    expect(estado.percentual).toBe(100);
    expect(doneCounts(db).get(id)).toBe(passos.length);
  });

  it("recusa pular um passo crítico e checklist incompleto", () => {
    const { db, id, passos } = novoProjeto();
    const critico = passos.find((p) => p.checkpoint);
    const depois = passos[passos.findIndex((p) => p === critico) + 1];
    if (!critico?.checkpoint || !depois) throw new Error("guia sem checklist");

    // Passo depois do crítico: bloqueado.
    const pulo = applyGuideAction(db, loaded, id, { tipo: "feito", passo_id: depois.id });
    expect(pulo).toMatchObject({ ok: false, erro: expect.stringContaining("Termine antes") });

    // O crítico sem checklist confirmado: recusado.
    expect(applyGuideAction(db, loaded, id, { tipo: "feito", passo_id: critico.id }).ok).toBe(
      false,
    );
    // Checklist com um item a menos: recusado.
    const incompleto = applyGuideAction(db, loaded, id, {
      tipo: "confirmar",
      passo_id: critico.id,
      marcados: critico.checkpoint.itens.slice(1),
    });
    expect(incompleto.ok).toBe(false);
    expect(getProgress(db, id)).toEqual([]);
  });

  it("desfazer um passo crítico apaga a confirmação do checklist", () => {
    const { db, id, passos } = novoProjeto();
    // Faz tudo até o primeiro passo crítico, inclusive.
    for (const passo of passos) {
      if (passo.checkpoint)
        applyGuideAction(db, loaded, id, {
          tipo: "confirmar",
          passo_id: passo.id,
          marcados: passo.checkpoint.itens,
        });
      applyGuideAction(db, loaded, id, { tipo: "feito", passo_id: passo.id });
      if (passo.checkpoint) {
        const r = applyGuideAction(db, loaded, id, { tipo: "desfazer", passo_id: passo.id });
        expect(r.ok).toBe(true);
        const salvo = getProgress(db, id).find((p) => p.passo_id === passo.id);
        expect(salvo).toMatchObject({ status: "pendente", checkpoint_confirmado_em: undefined });
        // Refazer pede o checklist de novo.
        expect(applyGuideAction(db, loaded, id, { tipo: "feito", passo_id: passo.id }).ok).toBe(
          false,
        );
        break;
      }
    }
  });

  it("passo inventado, projeto inexistente e recomeçar", () => {
    const { db, id, passos } = novoProjeto();
    expect(applyGuideAction(db, loaded, id, { tipo: "feito", passo_id: "inventado" }).ok).toBe(
      false,
    );
    expect(
      applyGuideAction(db, loaded, "00000000-0000-4000-8000-000000000000", { tipo: "recomecar" }),
    ).toMatchObject({ ok: false, erro: "Projeto não encontrado." });
    applyGuideAction(db, loaded, id, { tipo: "feito", passo_id: passos[0]!.id });
    expect(getProgress(db, id)).toHaveLength(1);
    expect(applyGuideAction(db, loaded, id, { tipo: "recomecar" })).toEqual({
      ok: true,
      progresso: [],
    });
  });

  it("apagar o projeto apaga o progresso", () => {
    const { db, id, passos } = novoProjeto();
    applyGuideAction(db, loaded, id, { tipo: "feito", passo_id: passos[0]!.id });
    deleteProject(db, id);
    expect(getProgress(db, id)).toEqual([]);
  });
});
