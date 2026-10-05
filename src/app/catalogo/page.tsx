import { FileJson, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { dataBr, fmt } from "@/components/format";
import { Seal } from "@/components/seal";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VERIFICATION_STATUSES, SEAL } from "@/domain/core/verification";
import { CatalogError, loadDroneCatalog } from "@/server/catalog/load";
import { type CatalogRow, catalogOverview } from "@/server/catalog/overview";

/*
 * Catálogo (SPEC B.6): a página "admin local" para listar, filtrar, verificar e atualizar preços.
 * A fonte da verdade são os arquivos JSON em data/catalog/drone (ADR-0015): o que você salvar
 * aqui vira um diff revisável no git.
 */

export const metadata: Metadata = { title: "Catálogo" };

const SECOES = [
  { id: "componentes", rotulo: "Peças" },
  { id: "empuxo", rotulo: "Tabelas de empuxo" },
  { id: "ferramentas", rotulo: "Ferramentas e EPI" },
  { id: "prontos", rotulo: "Drones prontos" },
] as const;
type SecaoId = (typeof SECOES)[number]["id"];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function matches(row: CatalogRow, q: string, categoria: string, selo: string, arquetipo: string) {
  const busca = q.trim().toLocaleLowerCase("pt-BR");
  if (busca && !`${row.nome} ${row.id}`.toLocaleLowerCase("pt-BR").includes(busca)) return false;
  if (categoria && row.categoria !== categoria) return false;
  if (selo && row.selo !== selo) return false;
  if (arquetipo && !row.arquetipos.includes(arquetipo)) return false;
  return true;
}

export default async function CatalogPage(props: PageProps<"/catalogo">) {
  await connection();
  const sp = await props.searchParams;
  const secao: SecaoId = SECOES.some((s) => s.id === one(sp.tipo))
    ? (one(sp.tipo) as SecaoId)
    : "componentes";
  const q = one(sp.q);
  const categoria = one(sp.categoria);
  const selo = one(sp.selo);
  const arquetipo = one(sp.arquetipo);

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

  const linhas = overview[secao];
  const filtradas = linhas.filter((r) => matches(r, q, categoria, selo, arquetipo));
  const categorias = [...new Set(linhas.map((r) => r.categoria))].sort();
  const contagem = Object.fromEntries(
    VERIFICATION_STATUSES.map((s) => [s, linhas.filter((r) => r.selo === s).length]),
  );
  const tipoItem =
    secao === "componentes"
      ? "componente"
      : secao === "ferramentas"
        ? "ferramenta"
        : secao === "prontos"
          ? "pronto"
          : "empuxo";

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
          <p className="text-sm">
            <Link href="/catalogo/importacao" className="underline underline-offset-2">
              Câmbio e impostos de importação
            </Link>{" "}
            (parâmetros com data, usados para converter os preços em US$).
          </p>
        </div>

        <nav aria-label="Tipo de item">
          <ul className="flex flex-wrap gap-2">
            {SECOES.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/catalogo?tipo=${s.id}`}
                  aria-current={s.id === secao ? "page" : undefined}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent aria-[current=page]:border-primary aria-[current=page]:bg-accent aria-[current=page]:font-semibold"
                >
                  {s.rotulo}
                  <span className="text-xs text-muted-foreground">({overview[s.id].length})</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <form
          method="get"
          className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-5"
        >
          <input type="hidden" name="tipo" value={secao} />
          <label className="space-y-1 text-sm lg:col-span-2">
            <span className="font-medium">Buscar</span>
            <span className="relative block">
              <Search
                aria-hidden="true"
                className="absolute top-2.5 left-2.5 size-4 text-muted-foreground"
              />
              <Input name="q" defaultValue={q} placeholder="nome, marca ou id" className="pl-8" />
            </span>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Categoria</span>
            <select
              name="categoria"
              defaultValue={categoria}
              className="h-9 w-full rounded-md border bg-background px-2"
            >
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Selo</span>
            <select
              name="selo"
              defaultValue={selo}
              className="h-9 w-full rounded-md border bg-background px-2"
            >
              <option value="">Todos</option>
              {VERIFICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SEAL[s].simbolo} {SEAL[s].rotulo} ({contagem[s] ?? 0})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Usado no arquétipo</span>
            <select
              name="arquetipo"
              defaultValue={arquetipo}
              className="h-9 w-full rounded-md border bg-background px-2"
            >
              <option value="">Qualquer um</option>
              {overview.arquetipos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.rotulo}: {a.nome}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
            <Button type="submit" size="sm">
              Filtrar
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/catalogo?tipo=${secao}`}>Limpar</Link>
            </Button>
            <p className="ml-auto text-sm text-muted-foreground" role="status">
              {filtradas.length} de {linhas.length}
            </p>
          </div>
        </form>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Itens do catálogo</caption>
            <thead className="bg-muted/60 text-xs">
              <tr>
                <th scope="col" className="p-2">
                  Item
                </th>
                <th scope="col" className="p-2">
                  Selo
                </th>
                <th scope="col" className="p-2">
                  Preço
                </th>
                <th scope="col" className="hidden p-2 md:table-cell">
                  Massa
                </th>
                <th scope="col" className="hidden p-2 md:table-cell">
                  Usado em
                </th>
                <th scope="col" className="p-2">
                  <span className="sr-only">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtradas.map((r) => (
                <tr key={r.id} className="align-top hover:bg-muted/30">
                  <th scope="row" className="p-2 font-normal">
                    <span className="font-medium">{r.nome}</span>
                    <span className="block text-xs text-muted-foreground">
                      {r.categoria} · <code>{r.id}</code> · {r.fontes} fonte(s)
                    </span>
                  </th>
                  <td className="p-2">{r.selo ? <Seal status={r.selo} /> : "—"}</td>
                  <td className="p-2 text-xs">
                    {r.preco ?? <span className="text-muted-foreground">sem preço pesquisado</span>}
                    {r.preco_data && (
                      <span className="block text-muted-foreground">em {dataBr(r.preco_data)}</span>
                    )}
                  </td>
                  <td className="hidden p-2 text-xs md:table-cell">
                    {r.massa_g !== undefined ? `${fmt(r.massa_g)} g` : "—"}
                  </td>
                  <td className="hidden p-2 text-xs md:table-cell">
                    {r.usado_em.length > 0 ? (
                      r.usado_em.join(", ")
                    ) : (
                      <span className="text-muted-foreground">nenhum build de referência</span>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    <Button asChild size="xs" variant="outline">
                      <Link href={`/catalogo/${tipoItem}/${r.id}`} aria-label={`Abrir ${r.nome}`}>
                        <FileJson aria-hidden="true" /> Abrir
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtradas.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Nenhum item com esses filtros.</p>
          )}
        </div>
      </main>
    </>
  );
}
