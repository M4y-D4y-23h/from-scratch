import {
  canConfirmCheckpoint,
  canMarkDone,
  type StepProgress,
  stepsUsingCategories,
} from "@/domain/categories/drone/guide";
import type { BuildStepTemplate, Component } from "@/domain/categories/drone/schema";
import type { LoadedCatalog } from "@/server/catalog/load";
import type { Db } from "@/server/db";
import { savedProjectView } from "@/server/project-view/view";
import {
  confirmCheckpoint,
  getProgress,
  reopenSteps,
  resetProgress,
  setStepStatus,
} from "@/server/projects/progress";
import { getProject, getVersion } from "@/server/projects/repository";
import { ownedTools } from "@/server/tools/owned";

/*
 * Ações do guia, sem depender do Next (testáveis): cada uma recalcula os passos da versão atual
 * do projeto com o catálogo atual e confere as regras do domínio antes de gravar. O navegador
 * só diz QUAL passo e quais itens marcou.
 */

export type GuideAction =
  | { tipo: "confirmar"; passo_id: string; marcados: string[] }
  | { tipo: "feito"; passo_id: string }
  | { tipo: "desfazer"; passo_id: string }
  | { tipo: "recomecar" };

export type GuideResult = { ok: true; progresso: StepProgress[] } | { ok: false; erro: string };

/** Os passos do guia da versão atual (os mesmos que a página mostra). */
export function currentSteps(
  db: Db,
  loaded: LoadedCatalog,
  projetoId: string,
): BuildStepTemplate[] | { erro: string } {
  const projeto = getProject(db, projetoId);
  const versao = projeto ? getVersion(db, projetoId) : undefined;
  if (!projeto || !versao) return { erro: "Projeto não encontrado." };
  const data = savedProjectView(
    {
      id: projetoId,
      titulo: projeto.titulo,
      versao: versao.numero,
      versao_atual: projeto.versao_atual,
      versoes: [],
      catalogo_hash: versao.catalogo_hash,
      escolha: versao.escolha,
      pecas: versao.pecas,
    },
    { loaded, ferramentasQueTenho: ownedTools(db) },
  );
  if ("erro" in data) return { erro: data.erro };
  return data.relatorio.passos;
}

export function applyGuideAction(
  db: Db,
  loaded: LoadedCatalog,
  projetoId: string,
  acao: GuideAction,
  agora = new Date(),
): GuideResult {
  const passos = currentSteps(db, loaded, projetoId);
  if ("erro" in passos) return { ok: false, erro: passos.erro };
  const progresso = getProgress(db, projetoId);

  switch (acao.tipo) {
    case "confirmar": {
      const check = canConfirmCheckpoint(acao.passo_id, acao.marcados, passos, progresso);
      if (!check.ok) return { ok: false, erro: check.motivo };
      confirmCheckpoint(db, projetoId, acao.passo_id, agora);
      break;
    }
    case "feito": {
      const check = canMarkDone(acao.passo_id, passos, progresso);
      if (!check.ok) return { ok: false, erro: check.motivo };
      setStepStatus(db, projetoId, acao.passo_id, "feito", agora);
      break;
    }
    case "desfazer": {
      if (!passos.some((p) => p.id === acao.passo_id)) {
        return { ok: false, erro: "Este passo não faz parte do guia deste projeto." };
      }
      setStepStatus(db, projetoId, acao.passo_id, "pendente", agora);
      break;
    }
    case "recomecar":
      resetProgress(db, projetoId);
      break;
  }
  return { ok: true, progresso: getProgress(db, projetoId) };
}

/**
 * Depois de uma versão nova (troca de peça, voltar para uma versão antiga): os passos que usam
 * uma peça que mudou voltam a pendente. Devolve quantos voltaram.
 */
export function reopenStepsAfterChange(
  db: Db,
  loaded: LoadedCatalog,
  projetoId: string,
  antes: readonly Component[],
  depois: readonly Component[],
): number {
  const idsAntes = new Set(antes.map((c) => c.id));
  const idsDepois = new Set(depois.map((c) => c.id));
  const mudaram = new Set(
    [
      ...antes.filter((c) => !idsDepois.has(c.id)),
      ...depois.filter((c) => !idsAntes.has(c.id)),
    ].map((c) => c.categoria as string),
  );
  if (mudaram.size === 0) return 0;
  const passos = currentSteps(db, loaded, projetoId);
  if ("erro" in passos) return 0;
  return reopenSteps(db, projetoId, stepsUsingCategories(passos, mudaram));
}
