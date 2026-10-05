import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { JsonEditorForm, PriceForm, VerifyForm } from "@/components/catalog/forms";
import { dataBr, fmt } from "@/components/format";
import { Seal } from "@/components/seal";
import { SiteHeader } from "@/components/site-header";
import { WHERE_TO_BUY_LABEL } from "@/domain/categories/drone/bom";
import type { Source } from "@/domain/core/source";
import type { VerificationStatus } from "@/domain/core/verification";
import { loadDroneCatalog } from "@/server/catalog/load";
import { CATALOG_KINDS, type CatalogKind, readCatalogItem } from "@/server/catalog/write";

/*
 * Um item do catálogo (SPEC B.6): os dados como o motor de cálculo usa, as fontes, e os
 * formulários para conferir (✅ com link e data), atualizar o preço com data e editar em JSON.
 */

const KIND_LABEL: Record<CatalogKind, string> = {
  componente: "Peça",
  empuxo: "Tabela de empuxo",
  ferramenta: "Ferramenta, consumível ou EPI",
  pronto: "Drone pronto de referência",
};

const SECAO: Record<CatalogKind, string> = {
  componente: "componentes",
  empuxo: "empuxo",
  ferramenta: "ferramentas",
  pronto: "prontos",
};

function isKind(v: string): v is CatalogKind {
  return (CATALOG_KINDS as readonly string[]).includes(v);
}

/** Achata specs aninhadas em linhas "chave: valor" para a tabela. */
function flatten(obj: unknown, prefixo = ""): Array<[string, string]> {
  if (obj === null || obj === undefined) return [];
  if (typeof obj !== "object" || Array.isArray(obj)) {
    const valor = Array.isArray(obj)
      ? obj.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join("; ")
      : typeof obj === "number"
        ? fmt(obj, 3)
        : typeof obj === "boolean"
          ? obj
            ? "sim"
            : "não"
          : String(obj);
    return [[prefixo, valor]];
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatten(v, prefixo ? `${prefixo}.${k}` : k),
  );
}

function Sources({ fontes }: { fontes: Source[] }) {
  if (fontes.length === 0)
    return <p className="text-sm text-muted-foreground">Nenhuma fonte registrada.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {fontes.map((f) => (
        <li key={`${f.titulo}-${f.url ?? ""}`}>
          {f.url ? (
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2"
            >
              {f.titulo}
              <ExternalLink aria-hidden="true" className="size-3" />
            </a>
          ) : (
            f.titulo
          )}
          <span className="text-xs text-muted-foreground">
            {" "}
            ({f.tipo}
            {f.acessado_em ? `, acessada em ${dataBr(f.acessado_em)}` : ""})
          </span>
          {f.observacao && (
            <span className="block text-xs text-muted-foreground">{f.observacao}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Section({
  titulo,
  children,
  id,
}: {
  titulo: string;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <section aria-labelledby={id} className="space-y-3 rounded-xl border p-4">
      <h2 id={id} className="text-lg font-semibold">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

export async function generateMetadata(
  props: PageProps<"/catalogo/[tipo]/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  return { title: `Catálogo: ${id}` };
}

export default async function CatalogItemPage(props: PageProps<"/catalogo/[tipo]/[id]">) {
  await connection();
  const { tipo, id } = await props.params;
  if (!isKind(tipo)) notFound();
  const bruto = readCatalogItem(tipo, id);
  if (!bruto) notFound();
  const { catalog } = loadDroneCatalog();

  let nome = id;
  let selo: VerificationStatus | undefined;
  let descricao: string | undefined;
  let fontes: Source[] = [];
  let linhas: Array<[string, string]> = [];
  let notas: string[] = [];
  let extra: React.ReactNode = null;

  if (tipo === "componente") {
    const c = catalog.componentes.find((x) => x.id === id);
    if (!c) notFound();
    nome = `${c.marca} ${c.modelo}`;
    selo = c.status_verificacao;
    descricao = c.descricao_leiga;
    fontes = c.fontes;
    notas = [...c.notas_seguranca.map((n) => `Segurança: ${n}`), ...c.notas];
    linhas = [
      ["categoria", c.categoria],
      [
        "massa (g)",
        c.massa_g !== undefined
          ? fmt(c.massa_g)
          : c.massa_estimada_g
            ? `${fmt(c.massa_estimada_g.valor)} (estimada: ${c.massa_estimada_g.motivo})`
            : "não publicada",
      ],
      ...(c.dimensoes_mm
        ? ([
            [
              "dimensões (mm)",
              `${fmt(c.dimensoes_mm.comprimento)} × ${fmt(c.dimensoes_mm.largura)} × ${fmt(c.dimensoes_mm.altura)}`,
            ],
          ] as Array<[string, string]>)
        : []),
      ["unidades por pacote", String(c.unidades_por_pacote)],
      ["faixas recomendadas", c.faixas.length > 0 ? c.faixas.join(", ") : "todas"],
      ...flatten(c.specs).map(([k, v]) => [`specs.${k}`, v] as [string, string]),
    ];
    extra = (
      <div className="space-y-1 text-sm">
        <p className="font-medium">Onde procurar</p>
        <ul className="list-disc pl-5">
          {c.onde_comprar.map((w) => (
            <li key={`${w.tipo_loja}-${w.termo_busca}`}>
              &ldquo;{w.termo_busca}&rdquo; em {WHERE_TO_BUY_LABEL[w.tipo_loja]}
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (tipo === "empuxo") {
    const t = catalog.empuxo.find((x) => x.id === id);
    if (!t) notFound();
    nome = `Tabela ${t.id}`;
    selo = t.status_verificacao;
    fontes = t.fontes;
    notas = t.notas;
    linhas = [
      ["motor", t.motor_id],
      ["hélice", t.helice_id],
      ["células", `${t.celulas}S`],
      ...(t.tensao_teste_v
        ? ([["tensão do teste (V)", fmt(t.tensao_teste_v)]] as Array<[string, string]>)
        : []),
    ];
    extra = (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Pontos da tabela de empuxo</caption>
          <thead className="bg-muted/60 text-xs">
            <tr>
              <th scope="col" className="p-2">
                Acelerador
              </th>
              <th scope="col" className="p-2">
                Empuxo (g)
              </th>
              <th scope="col" className="p-2">
                Corrente (A)
              </th>
              <th scope="col" className="p-2">
                Potência (W)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {t.pontos.map((p) => (
              <tr key={p.throttle_pct}>
                <td className="p-2">{fmt(p.throttle_pct)}%</td>
                <td className="p-2">{fmt(p.empuxo_g)}</td>
                <td className="p-2">{fmt(p.corrente_a, 2)}</td>
                <td className="p-2">{p.potencia_w !== undefined ? fmt(p.potencia_w) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (tipo === "ferramenta") {
    const f = catalog.ferramentas.find((x) => x.id === id);
    if (!f) notFound();
    nome = f.nome;
    selo = f.preco_estimado_brl?.status;
    descricao = f.para_que_serve;
    fontes = f.fontes;
    notas = f.cuidados.map((c) => `Cuidado: ${c}`);
    linhas = [
      ["tipo", f.tipo],
      ["prioridade", f.prioridade],
      ["por que é necessária", f.por_que_necessaria],
      ["alternativa barata", f.alternativa_barata ?? "—"],
      ["arquétipos", f.arquetipos.length > 0 ? f.arquetipos.join(", ") : "todos"],
    ];
  } else {
    const r = catalog.prontos.find((x) => x.id === id);
    if (!r) notFound();
    nome = `${r.marca} ${r.modelo}`;
    selo = r.status_verificacao;
    descricao = r.descricao_leiga;
    fontes = r.fontes;
    notas = [...r.diferencas.map((d) => `Diferença: ${d}`), ...r.notas];
    linhas = [
      ["tipo", r.tipo],
      ["arquétipo", r.arquetipo_id],
      ["traz", r.cobre_categorias.join(", ")],
      ["baterias inclusas", r.baterias_inclusas !== undefined ? String(r.baterias_inclusas) : "—"],
      ["massa (g)", r.massa_g !== undefined ? fmt(r.massa_g) : "—"],
      [
        "tempo de voo do fabricante (min)",
        r.tempo_voo_fabricante_min !== undefined ? fmt(r.tempo_voo_fabricante_min) : "—",
      ],
    ];
  }

  const brl = bruto.item.preco_estimado_brl as
    { min: number; max: number; data: string; status?: string } | undefined;
  const usd = bruto.item.preco_referencia_usd as
    { min: number; max: number; data: string; loja: string } | undefined;

  return (
    <>
      <SiteHeader atual="catalogo" />
      <main id="conteudo" className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="space-y-2">
          <Link
            href={`/catalogo?tipo=${SECAO[tipo]}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeft aria-hidden="true" className="size-4" /> Catálogo
          </Link>
          <p className="text-sm text-muted-foreground">{KIND_LABEL[tipo]}</p>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
            {nome}
            {selo && <Seal status={selo} />}
          </h1>
          {descricao && <p className="max-w-3xl text-muted-foreground">{descricao}</p>}
          <p className="text-xs text-muted-foreground">
            Arquivo: <code>data/catalog/drone/{bruto.arquivo}</code> · id <code>{id}</code>
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section titulo="Dados usados pelo motor de cálculo" id="sec-dados">
            <dl className="divide-y text-sm">
              {linhas.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 py-1.5">
                  <dt className="font-mono text-xs text-muted-foreground">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
            </dl>
            {extra}
            {notas.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {notas.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </Section>

          <div className="space-y-6">
            <Section titulo="Fontes" id="sec-fontes">
              <Sources fontes={fontes} />
            </Section>
            {tipo !== "empuxo" && (
              <Section titulo="Preço" id="sec-preco">
                <dl className="space-y-1 text-sm">
                  <div>
                    <dt className="inline font-medium">Em lojas brasileiras (R$): </dt>
                    <dd className="inline">
                      {brl
                        ? `R$ ${fmt(brl.min, 2)} a R$ ${fmt(brl.max, 2)} em ${dataBr(brl.data)} (${brl.status ?? "estimativa"})`
                        : "não informado"}
                    </dd>
                  </div>
                  {tipo !== "ferramenta" && (
                    <div>
                      <dt className="inline font-medium">Loja internacional (US$): </dt>
                      <dd className="inline">
                        {usd
                          ? `US$ ${fmt(usd.min, 2)} a US$ ${fmt(usd.max, 2)} em ${dataBr(usd.data)}, ${usd.loja}`
                          : "não informado"}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="text-xs text-muted-foreground">
                  O preço em R$, quando existe, vale no lugar da conversão do preço em US$ (câmbio e
                  impostos de importação).
                </p>
                <PriceForm
                  kind={tipo}
                  id={id}
                  versao={bruto.versao}
                  permiteUsd={tipo !== "ferramenta"}
                  temBrl={brl !== undefined}
                />
              </Section>
            )}
          </div>
        </div>

        {tipo !== "ferramenta" && (
          <Section titulo="Conferir e marcar como verificado" id="sec-verificar">
            <p className="text-sm text-muted-foreground">
              Abra a página do fabricante (ou o datasheet), confira os dados acima e registre a
              fonte. O selo só fica ✅ com um link e a data em que você conferiu; os cálculos que
              usam este item continuam ⚠️ estimativa no máximo (ADR-0016).
            </p>
            <VerifyForm
              kind={tipo}
              id={id}
              versao={bruto.versao}
              verificado={selo === "verificado"}
            />
          </Section>
        )}

        <Section titulo="Editar em JSON" id="sec-json">
          <p className="text-sm text-muted-foreground">
            Para mudar qualquer outro campo (specs, notas, onde comprar). O formato está em
            src/domain/categories/drone/schema.ts.
          </p>
          <JsonEditorForm
            kind={tipo}
            id={id}
            versao={bruto.versao}
            json={JSON.stringify(bruto.item, null, 2)}
          />
        </Section>
      </main>
    </>
  );
}
