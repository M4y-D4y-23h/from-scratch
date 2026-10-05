import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ProjectPage } from "@/components/project/project-page";
import { isTab } from "@/components/project/tab-ids";
import { TIER_LABEL } from "@/domain/categories/drone/build";
import { TIERS } from "@/domain/categories/drone/solver";
import { loadDroneCatalog } from "@/server/catalog/load";
import { getDb } from "@/server/db";
import { referenceProjectView } from "@/server/project-view/view";
import { ownedTools } from "@/server/tools/owned";

/*
 * Build de referência com os painéis da SPEC B.12 (aceite da Fase 3). A página é calculada a cada
 * visita: o catálogo pode ter mudado pela página /catalogo e o "já tenho" fica no banco.
 */

function tierOf(value: string) {
  return TIERS.find((t) => t === value);
}

export async function generateMetadata(
  props: PageProps<"/referencia/[arquetipo]/[faixa]">,
): Promise<Metadata> {
  const { arquetipo, faixa } = await props.params;
  const tier = tierOf(faixa);
  const nome = loadDroneCatalog().catalog.arquetipos.find((a) => a.id === arquetipo)?.nome;
  return { title: nome && tier ? `${nome} (${TIER_LABEL[tier]})` : "Build de referência" };
}

export default async function ReferencePage(props: PageProps<"/referencia/[arquetipo]/[faixa]">) {
  await connection();
  const { arquetipo, faixa } = await props.params;
  const { aba } = await props.searchParams;
  const tier = tierOf(faixa);
  if (!tier) notFound();
  const loaded = loadDroneCatalog();
  const data = referenceProjectView(arquetipo, tier, {
    loaded,
    ferramentasQueTenho: ownedTools(getDb()),
  });
  if (!data) notFound();
  return (
    <ProjectPage
      data={data}
      aba={isTab(aba) ? aba : "pecas"}
      frames={loaded.catalog.componentes.filter((c) => c.categoria === "frame")}
    />
  );
}
