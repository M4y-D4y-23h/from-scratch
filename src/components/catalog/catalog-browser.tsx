"use client";

import { FileJson, Landmark, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { dataBr, fmt } from "@/components/format";
import { Seal } from "@/components/seal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SEAL, VERIFICATION_STATUSES } from "@/domain/core/verification";
import type { CatalogOverview, CatalogRow } from "@/server/catalog/overview";

import { type CatalogFilters, isSecao, SECOES } from "./sections";

/*
 * Navegação do /catalogo (SPEC B.6): uma aba por tipo de item e, dentro dela, busca e filtros que
 * respondem na hora (sem recarregar a página: o catálogo inteiro tem menos de 100 linhas e já veio
 * do servidor). A aba e os filtros ficam no endereço, para dar para voltar e compartilhar.
 */

function matches(row: CatalogRow, f: CatalogFilters) {
  const busca = f.q.trim().toLocaleLowerCase("pt-BR");
  if (busca && !`${row.nome} ${row.id}`.toLocaleLowerCase("pt-BR").includes(busca)) return false;
  if (f.categoria && row.categoria !== f.categoria) return false;
  if (f.selo && row.selo !== f.selo) return false;
  if (f.arquetipo && !row.arquetipos.includes(f.arquetipo)) return false;
  return true;
}

/** Aba e filtros no endereço, sem recarregar a página. */
function syncUrl(f: CatalogFilters) {
  const url = new URL(window.location.href);
  const valores: Array<[string, string]> = [
    ["tipo", f.secao === "componentes" ? "" : f.secao],
    ["q", f.q],
    ["categoria", f.categoria],
    ["selo", f.selo],
    ["arquetipo", f.arquetipo],
  ];
  for (const [k, v] of valores) {
    if (v) url.searchParams.set(k, v);
    else url.searchParams.delete(k);
  }
  window.history.replaceState(window.history.state, "", url);
}

const SELECT =
  "h-9 w-full rounded-md border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";

export function CatalogBrowser({
  overview,
  inicial,
}: {
  overview: CatalogOverview;
  inicial: CatalogFilters;
}) {
  const [f, setF] = useState<CatalogFilters>(inicial);
  const mudar = (novo: Partial<CatalogFilters>) => {
    const proximo = { ...f, ...novo };
    setF(proximo);
    syncUrl(proximo);
  };

  return (
    <Tabs
      value={f.secao}
      // Trocar de aba limpa os filtros: cada aba tem as suas categorias, e uma busca feita em
      // "Peças" deixaria "Drones prontos" vazia sem a pessoa entender por quê.
      onValueChange={(v) => {
        if (isSecao(v)) mudar({ secao: v, q: "", categoria: "", selo: "", arquetipo: "" });
      }}
      className="gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList
          aria-label="Tipo de item"
          className="grid h-auto w-full grid-cols-2 gap-1 p-1 group-data-[orientation=horizontal]/tabs:h-auto sm:w-auto sm:grid-cols-4"
        >
          {SECOES.map(({ id, rotulo, Icon }) => (
            <TabsTrigger key={id} value={id} className="h-auto gap-1.5 px-3 py-2 text-sm">
              <Icon aria-hidden="true" />
              <span>{rotulo}</span>
              <span className="rounded-full bg-muted px-1.5 text-[0.7rem] leading-4 text-muted-foreground">
                {overview[id].length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        <Button asChild variant="outline" size="sm">
          <Link href="/catalogo/importacao">
            <Landmark aria-hidden="true" /> Câmbio e impostos
          </Link>
        </Button>
      </div>
      {SECOES.map((s) => (
        <TabsContent key={s.id} value={s.id} className="space-y-4">
          <Section linhas={overview[s.id]} secao={s} f={f} mudar={mudar} overview={overview} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function Section({
  linhas,
  secao,
  f,
  mudar,
  overview,
}: {
  linhas: CatalogRow[];
  secao: (typeof SECOES)[number];
  f: CatalogFilters;
  mudar: (novo: Partial<CatalogFilters>) => void;
  overview: CatalogOverview;
}) {
  const categorias = useMemo(() => [...new Set(linhas.map((r) => r.categoria))].sort(), [linhas]);
  const contagem = useMemo(
    () =>
      Object.fromEntries(
        VERIFICATION_STATUSES.map((s) => [s, linhas.filter((r) => r.selo === s).length]),
      ),
    [linhas],
  );
  const filtradas = linhas.filter((r) => matches(r, f));
  const filtrando = Boolean(f.q || f.categoria || f.selo || f.arquetipo);

  return (
    <>
      <div
        role="search"
        aria-label={`Filtrar ${secao.rotulo.toLowerCase()}`}
        className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="space-y-1 text-sm lg:col-span-2">
          <span className="font-medium">Buscar</span>
          <span className="relative block">
            <Search
              aria-hidden="true"
              className="absolute top-2.5 left-2.5 size-4 text-muted-foreground"
            />
            <Input
              type="search"
              value={f.q}
              onChange={(e) => mudar({ q: e.target.value })}
              placeholder="nome, marca ou id"
              className="pl-8"
            />
          </span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Categoria</span>
          <select
            value={f.categoria}
            onChange={(e) => mudar({ categoria: e.target.value })}
            className={SELECT}
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
            value={f.selo}
            onChange={(e) => mudar({ selo: e.target.value })}
            className={SELECT}
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
            value={f.arquetipo}
            onChange={(e) => mudar({ arquetipo: e.target.value })}
            className={SELECT}
          >
            <option value="">Qualquer um</option>
            {overview.arquetipos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.rotulo}: {a.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-5">
          {filtrando && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => mudar({ q: "", categoria: "", selo: "", arquetipo: "" })}
            >
              <X aria-hidden="true" /> Limpar filtros
            </Button>
          )}
          <p className="ml-auto text-sm text-muted-foreground" role="status">
            {filtradas.length} de {linhas.length}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{secao.rotulo} do catálogo</caption>
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
                    <Link
                      href={`/catalogo/${secao.tipoItem}/${r.id}`}
                      aria-label={`Abrir ${r.nome}`}
                    >
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
    </>
  );
}
