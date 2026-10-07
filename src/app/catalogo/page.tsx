import type { Metadata } from "next";
import { connection } from "next/server";

import { CatalogBrowser } from "@/components/catalog/catalog-browser";
import { isSecao } from "@/components/catalog/sections";
import { Seal } from "@/components/seal";
import { SiteHeader } from "@/components/site-header";
import { CatalogError, loadDroneCatalog } from "@/server/catalog/load";
import { catalogOverview } from "@/server/catalog/overview";

/*
 * Catálogo (SPEC B.6): a página "admin local" para listar, filtrar, verificar e atualizar preços.
 * A fonte da verdade são os arquivos JSON em data/catalog/drone (ADR-0015): o que você salvar
 * aqui vira um diff revisável no git. As abas e os filtros rodam no navegador (CatalogBrowser).
 */

export const metadata: Metadata = { title: "Catálogo" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CatalogPage(props: PageProps<"/catalogo">) {
  await connection();
  const sp = await props.searchParams;
  const tipo = one(sp.tipo);
  const inicial = {
    secao: isSecao(tipo) ? tipo : ("componentes" as const),
    q: one(sp.q),
    categoria: one(sp.categoria),
    selo: one(sp.selo),
    arquetipo: one(sp.arquetipo),
  };

  let overview;
  try {
    overview = catalogOverview(loadDroneCatalog());
  } catch (error) {
    if (!(error instanceof CatalogError)) throw error;
    return (
      <>
        <SiteHeader atual="catalogo" />
        <main id="conteudo" className="mx-auto max-w-4xl space-y-4 px-4 py-8">
          <h1 className="text-3xl font-bold tracking-tight">Catálogo</h1>
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-4 dark:bg-red-950/40"
          >
            <p className="font-semibold">
              O catálogo tem problemas e não pode ser usado até corrigir:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {error.problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm">
              Corrija os arquivos em data/catalog/drone (ou desfaça com git) e recarregue. O comando
              pnpm catalog:check mostra a mesma lista.
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader atual="catalogo" />
      <main id="conteudo" className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Catálogo</h1>
          <p className="max-w-3xl text-muted-foreground">
            As peças, tabelas de empuxo, ferramentas e drones prontos que o motor de cálculo usa.
            Tudo nasce como <Seal status="nao_verificado" compacto /> não verificado: abra um item,
            confira na fonte e marque como verificado, ou atualize o preço com a data. Cada mudança
            é gravada no arquivo JSON do catálogo e aparece no <code>git diff</code>.
          </p>
        </div>

        <CatalogBrowser overview={overview} inicial={inicial} />
      </main>
    </>
  );
}
