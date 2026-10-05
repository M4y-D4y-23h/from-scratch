import type { Build, Tier } from "@/domain/categories/drone/build";
import { DEFAULT_DRONE_CONFIG } from "@/domain/categories/drone/config";
import { buildProjectReport } from "@/domain/categories/drone/project";
import { type ScenePartInfo, scenePartsInfo } from "@/domain/categories/drone/scene";
import type { Component, Firmware } from "@/domain/categories/drone/schema";
import { solve, TIERS } from "@/domain/categories/drone/solver";
import { loadDroneCatalog } from "@/server/catalog/load";

/*
 * Dados do visualizador 3D para os builds de referência (Fase 2). Roda no servidor (lê o catálogo
 * do disco); a página entrega o resultado, já serializável, para o componente do navegador, que
 * monta a cena com o domínio (scene.ts) e desenha.
 */

export type ViewerData = {
  arquetipo: { id: string; nome: string; firmware: Firmware; para_quem: string };
  faixa: Tier;
  build: Build;
  /** Painel de cada peça que aparece no 3D (nome, função, preço, selo, onde comprar). */
  partes: Record<string, ScenePartInfo>;
  /** Passos do guia que valem para o build, com as categorias de peça de cada um. */
  passos: Array<{ id: string; titulo: string; pecas: string[] }>;
  /** Outras peças do catálogo para o "experimentar" do 3D (só desenho, sem revalidar). */
  alternativas: { frames: Component[]; helices: Component[] };
};

export const TIER_LABEL: Record<Tier, string> = {
  economica: "Econômica",
  equilibrada: "Equilibrada",
  premium: "Premium",
};

export function isTier(value: string): value is Tier {
  return (TIERS as readonly string[]).includes(value);
}

/** Todas as combinações arquétipo × faixa do catálogo (páginas geradas no build). */
export function referenceViewerParams(): Array<{ arquetipo: string; faixa: Tier }> {
  const { catalog } = loadDroneCatalog();
  return catalog.arquetipos.flatMap((a) => TIERS.map((faixa) => ({ arquetipo: a.id, faixa })));
}

export function referenceArchetypes(): Array<{ id: string; nome: string }> {
  const { catalog } = loadDroneCatalog();
  return catalog.arquetipos.map((a) => ({ id: a.id, nome: a.nome }));
}

export function loadReferenceViewer(arquetipoId: string, faixa: string): ViewerData | undefined {
  if (!isTier(faixa)) return undefined;
  const { catalog } = loadDroneCatalog();
  const archetype = catalog.arquetipos.find((a) => a.id === arquetipoId);
  if (!archetype) return undefined;
  const plano = solve({ archetype, catalog, config: DEFAULT_DRONE_CONFIG }).faixas.find(
    (p) => p.faixa === faixa,
  );
  if (!plano) return undefined;
  const projeto = buildProjectReport(plano.build, archetype, catalog, DEFAULT_DRONE_CONFIG);
  return {
    arquetipo: {
      id: archetype.id,
      nome: archetype.nome,
      firmware: archetype.firmware,
      para_quem: archetype.para_quem,
    },
    faixa,
    build: plano.build,
    partes: scenePartsInfo(plano.build, projeto.custos),
    passos: projeto.passos.map((p) => ({ id: p.id, titulo: p.titulo, pecas: p.pecas })),
    alternativas: {
      frames: catalog.componentes.filter((c) => c.categoria === "frame"),
      helices: catalog.componentes.filter((c) => c.categoria === "helice"),
    },
  };
}
