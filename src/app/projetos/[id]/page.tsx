import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ProjectPage } from "@/components/project/project-page";
import { isTab } from "@/components/project/tab-ids";
import { SiteHeader } from "@/components/site-header";
import { loadDroneCatalog } from "@/server/catalog/load";
import { getDb } from "@/server/db";
import { savedProjectView } from "@/server/project-view/view";
import { getProject, getVersion, listVersions } from "@/server/projects/repository";
import { ownedTools } from "@/server/tools/owned";

/*
 * O seu projeto: a versão atual (ou outra, com ?versao=N), recalculada com o catálogo atual, com
 * as trocas de peça e o histórico de versões (SPEC B.5 e B.10.8).
 */

export async function generateMetadata(props: PageProps<"/projetos/[id]">): Promise<Metadata> {
  await connection();
  const { id } = await props.params;
  return { title: getProject(getDb(), id)?.titulo ?? "Projeto" };
}

export default async function SavedProjectPage(props: PageProps<"/projetos/[id]">) {
  await connection();
  const { id } = await props.params;
  const { aba, versao } = await props.searchParams;
  const db = getDb();
  const projeto = getProject(db, id);
  if (!projeto) notFound();
  const numero = typeof versao === "string" && /^\d+$/.test(versao) ? Number(versao) : undefined;
  const v = getVersion(db, id, numero);
  if (!v) notFound();
  const loaded = loadDroneCatalog();
  const data = savedProjectView(
    {
      id,
      titulo: projeto.titulo,
      versao: v.numero,
      versao_atual: projeto.versao_atual,
      versoes: listVersions(db, id),
      catalogo_hash: v.catalogo_hash,
      escolha: v.escolha,
      pecas: v.pecas,
    },
    { loaded, ferramentasQueTenho: ownedTools(db) },
  );
  if ("erro" in data) {
    return (
      <>
        <SiteHeader />
        <main id="conteudo" className="mx-auto max-w-3xl space-y-4 px-4 py-10">
          <h1 className="text-2xl font-bold">{projeto.titulo}</h1>
          <p
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-4 dark:bg-red-950/40"
          >
            Esta versão não pode ser montada com o catálogo atual: {data.erro}
          </p>
          <p>
            <Link href="/" className="underline underline-offset-2">
              Voltar para o início
            </Link>
          </p>
        </main>
      </>
    );
  }
  return (
    <ProjectPage
      data={data}
      aba={isTab(aba) ? aba : "pecas"}
      frames={loaded.catalog.componentes.filter((c) => c.categoria === "frame")}
    />
  );
}
