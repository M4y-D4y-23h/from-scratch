import { ExternalLink, Package, Store } from "lucide-react";

import { dataBr, formatRange, priceWithDate, unpricedNote } from "@/components/format";
import { Glossed } from "@/components/glossary/glossary";
import { Seal } from "@/components/seal";
import type { BomRow, PurchaseOption } from "@/domain/categories/drone/bom";
import type { ReadyMadeVerdict } from "@/domain/categories/drone/ready-made";
import type { CentsRange } from "@/domain/core/money";
import type { ProjectViewData, ToolView } from "@/server/project-view/view";

import { ToolOwnedToggle } from "../tool-owned-toggle";
import { ShowIn3DButton, SwapButton } from "../workspace-buttons";

/*
 * Aba "Peças e Custos" (SPEC B.12): totais em faixa (peças, ferramentas, consumíveis, EPI e
 * importação estimada), a lista de peças agrupada com selo, links de busca e "trocar", as
 * ferramentas com "já tenho", e montar × comprar pronto.
 */

const VERDICT: Record<ReadyMadeVerdict, { texto: string; estilo: string }> = {
  pronto_mais_barato: {
    texto: "O pronto sai mais barato",
    estilo: "bg-amber-100 text-amber-950 dark:bg-amber-900/60 dark:text-amber-50",
  },
  montar_mais_barato: {
    texto: "Montar sai mais barato",
    estilo: "bg-emerald-100 text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-50",
  },
  parecido: { texto: "Preço parecido", estilo: "bg-muted text-foreground" },
  sem_preco: { texto: "Sem preço para comparar", estilo: "bg-muted text-muted-foreground" },
};

const PRIORIDADE: Record<ToolView["prioridade"], string> = {
  essencial: "Essencial",
  recomendada: "Recomendada",
  opcional: "Opcional",
};

const TIPO_FERRAMENTA: Record<ToolView["tipo"], string> = {
  ferramenta: "Ferramentas",
  consumivel: "Consumíveis",
  epi: "Equipamento de proteção (EPI)",
};

export function PartsCostsTab({ data }: { data: ProjectViewData }) {
  const c = data.relatorio.custos;
  const trocaveis = new Set(
    data.alternativas
      .filter((a) => a.compativeis.length > 0 || a.incompativeis.some((x) => x.sugestao))
      .map((a) => a.slot),
  );
  return (
    <>
      <section aria-labelledby="titulo-custos" className="space-y-3">
        <h3 id="titulo-custos" className="text-lg font-semibold">
          Quanto custa
        </h3>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Total rotulo="Peças" faixa={c.total_pecas} destaque />
          <Total rotulo="Ferramentas" faixa={c.totais_por_tipo.ferramenta} />
          <Total rotulo="Consumíveis" faixa={c.totais_por_tipo.consumivel} />
          <Total rotulo="EPI" faixa={c.totais_por_tipo.epi} />
          <Total
            rotulo="Importação estimada"
            faixa={c.importacao_estimada}
            nota="já incluída nas peças"
          />
          <Total
            rotulo="Total geral"
            faixa={c.total}
            destaque
            nota={unpricedNote(c.sem_preco.length)}
          />
        </dl>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            Faixas em R$ com a data do preço mais antigo; sempre ⚠️ estimativa. Frete, IOF e spread
            do cartão não estão incluídos.
          </li>
          {c.aviso_importacao && <li>{c.aviso_importacao}</li>}
          {c.total_recomendadas.max_centavos > 0 && (
            <li>Ferramentas recomendadas (fora do total): {formatRange(c.total_recomendadas)}.</li>
          )}
          {c.sem_preco.length > 0 && (
            <li>Sem preço pesquisado (fora do total): {c.sem_preco.join(", ")}.</li>
          )}
          {c.ja_tenho.length > 0 && <li>Você já tem (fora do total): {c.ja_tenho.join(", ")}.</li>}
        </ul>
      </section>

      <section aria-labelledby="titulo-pecas" className="space-y-4">
        <div>
          <h3 id="titulo-pecas" className="text-lg font-semibold">
            Lista de peças
          </h3>
          <p className="text-sm text-muted-foreground">
            Os links abrem uma <strong>busca</strong> pelo termo na loja, nunca um anúncio
            específico: confira se o anúncio é do modelo exato.
          </p>
        </div>
        {data.bom.map((g) => (
          <div key={g.grupo} className="space-y-2">
            <h4 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {g.rotulo}
            </h4>
            <ul className="space-y-2">
              {g.linhas.map((row) => (
                <li key={`${row.slot}-${row.componente_id}`}>
                  <PartRow row={row} trocavel={trocaveis.has(row.slot)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section aria-labelledby="titulo-ferramentas" className="space-y-3">
        <div>
          <h3 id="titulo-ferramentas" className="text-lg font-semibold">
            Ferramentas, consumíveis e EPI
          </h3>
          <p className="text-sm text-muted-foreground">
            Quem começa do zero precisa comprar as ferramentas também. Marque &ldquo;já tenho&rdquo;
            para tirar uma do custo (vale para todos os seus projetos).
          </p>
        </div>
        {(["ferramenta", "consumivel", "epi"] as const).map((tipo) => {
          const lista = data.ferramentas.filter((f) => f.tipo === tipo);
          if (lista.length === 0) return null;
          return (
            <div key={tipo} className="space-y-2">
              <h4 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                {TIPO_FERRAMENTA[tipo]}
              </h4>
              <ul className="divide-y rounded-lg border">
                {lista.map((f) => (
                  <li key={f.id} className="p-3">
                    <ToolRow ferramenta={f} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <ReadyMadeSection data={data} />
    </>
  );
}

function Total({
  rotulo,
  faixa,
  destaque = false,
  nota,
}: {
  rotulo: string;
  faixa: CentsRange;
  destaque?: boolean;
  nota?: string;
}) {
  return (
    <div className={`rounded-lg border p-3 ${destaque ? "bg-muted/60" : ""}`}>
      <dt className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
        <span>{rotulo}</span>
        <Seal status={faixa.status} compacto />
      </dt>
      <dd className={destaque ? "text-base font-semibold" : "text-sm font-medium"}>
        {formatRange(faixa)}
      </dd>
      {nota && <dd className="text-xs text-muted-foreground">{nota}</dd>}
      {faixa.data_mais_antiga && (
        <dd className="text-[0.7rem] text-muted-foreground">
          preço de {dataBr(faixa.data_mais_antiga)}
        </dd>
      )}
    </div>
  );
}

function quantityText(row: BomRow): string {
  const partes: string[] = [];
  if (row.voa) partes.push(`${row.quantidade_no_drone} no drone`);
  if (row.vem_com) {
    const extra = row.custo && row.custo.origem !== "incluido" ? row.custo.quantidade : 0;
    partes.push(
      extra > 0
        ? `vem na caixa de ${row.vem_com.nome}; compre mais ${extra} pacote(s) de reserva`
        : `vem na caixa de ${row.vem_com.nome}`,
    );
  } else {
    const pacotes = row.custo?.quantidade ?? row.quantidade_compra;
    partes.push(
      row.unidades_por_pacote > 1
        ? `comprar ${row.quantidade_compra} (${pacotes} pacote(s) de ${row.unidades_por_pacote})`
        : `comprar ${row.quantidade_compra}`,
    );
  }
  return partes.join(" · ");
}

function PartRow({ row, trocavel }: { row: BomRow; trocavel: boolean }) {
  const custo = row.custo;
  return (
    <article className="rounded-lg border p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs text-muted-foreground">{row.rotulo}</p>
          <h5 className="flex flex-wrap items-center gap-1.5 font-medium">
            {row.nome}
            <Seal status={row.selo} compacto />
          </h5>
        </div>
        <p className="shrink-0 text-right text-sm">
          {custo?.origem === "incluido" ? (
            <span className="text-muted-foreground">incluído</span>
          ) : custo?.faixa ? (
            <span className="font-medium">{formatRange(custo.faixa)}</span>
          ) : (
            <span className="text-muted-foreground">sem preço</span>
          )}
          {custo?.origem === "importacao" && (
            <span className="block text-[0.7rem] text-muted-foreground">
              importado, com tributos
            </span>
          )}
        </p>
      </div>
      <p className="mt-1 text-muted-foreground">
        <Glossed text={row.descricao_leiga} />
      </p>
      <p className="mt-1 text-xs">{quantityText(row)}</p>
      {row.conteudo.length > 0 && (
        <p className="mt-1 flex gap-1 text-xs">
          <Package aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>Na caixa: {row.conteudo.map((c) => `${c.quantidade}× ${c.nome}`).join(", ")}</span>
        </p>
      )}
      {row.notas_seguranca.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-amber-900 dark:text-amber-200">
          {row.notas_seguranca.map((n) => (
            <li key={n}>⚠️ {n}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {!row.vem_com && <BuyLinks opcoes={row.onde_comprar} />}
        <span className="ml-auto flex gap-1">
          {trocavel && <SwapButton slot={row.slot} rotulo={row.rotulo} />}
          {row.voa && <ShowIn3DButton componenteId={row.componente_id} nome={row.nome} />}
        </span>
      </div>
    </article>
  );
}

export function BuyLinks({ opcoes }: { opcoes: PurchaseOption[] }) {
  const comLink = opcoes.flatMap((o) => o.links.map((l) => ({ ...l, termo: o.termo_busca })));
  const semLink = opcoes.filter((o) => o.links.length === 0);
  return (
    <>
      {comLink.map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`Buscar "${l.termo}" no ${l.rotulo}`}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-accent"
        >
          {l.rotulo}
          <ExternalLink aria-hidden="true" className="size-3" />
          <span className="sr-only">(busca, abre em outra aba)</span>
        </a>
      ))}
      {semLink.map((o) => (
        <span
          key={`${o.tipo_loja}-${o.termo_busca}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground"
        >
          <Store aria-hidden="true" className="size-3" />
          {o.rotulo}: &ldquo;{o.termo_busca}&rdquo;
        </span>
      ))}
    </>
  );
}

function ToolRow({ ferramenta: f }: { ferramenta: ToolView }) {
  return (
    <div className="space-y-1.5 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-medium ${f.ja_tenho ? "text-muted-foreground line-through" : ""}`}>
            {f.nome}
          </p>
          <p className="text-xs text-muted-foreground">
            {PRIORIDADE[f.prioridade]} ·{" "}
            {f.custo.faixa ? priceWithDate(f.custo.faixa) : "sem preço pesquisado"}
          </p>
        </div>
        <ToolOwnedToggle ferramentaId={f.id} nome={f.nome} jaTenho={f.ja_tenho} />
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium">Para que serve e cuidados</summary>
        <div className="mt-2 space-y-1.5 text-muted-foreground">
          <p>
            <Glossed text={f.para_que_serve} />
          </p>
          <p>
            <span className="font-medium text-foreground">Por que precisa:</span>{" "}
            <Glossed text={f.por_que_necessaria} />
          </p>
          {f.alternativa_barata && (
            <p>
              <span className="font-medium text-foreground">Alternativa barata:</span>{" "}
              {f.alternativa_barata}
            </p>
          )}
          {f.cuidados.length > 0 && (
            <ul className="list-disc pl-5">
              {f.cuidados.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          {f.passos.length > 0 && <p className="text-xs">Usada em: {f.passos.join("; ")}.</p>}
          <div className="flex flex-wrap gap-1.5">
            <BuyLinks opcoes={f.onde_comprar} />
          </div>
        </div>
      </details>
    </div>
  );
}

function ReadyMadeSection({ data }: { data: ProjectViewData }) {
  const p = data.relatorio.prontos;
  if (p.opcoes.length === 0) return null;
  return (
    <section aria-labelledby="titulo-pronto" className="space-y-3">
      <div>
        <h3 id="titulo-pronto" className="text-lg font-semibold">
          Montar ou comprar pronto?
        </h3>
        <p className="text-sm text-muted-foreground">{p.aviso}</p>
      </div>
      <p className="text-sm">
        Peças deste projeto: <strong>{formatRange(p.montar_pecas)}</strong>, mais{" "}
        {formatRange(p.montar_ferramentas)} em ferramentas e EPI que só montar exige.
      </p>
      <ul className="space-y-2">
        {p.opcoes.map((o) => (
          <li key={o.id} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {o.nome}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({o.tipo === "RTF" ? "RTF: vem com rádio" : "BNF: usa o seu rádio"})
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {o.preco ? `Drone: ${formatRange(o.preco)}` : "sem preço"}
                  {o.complementos.length > 0 &&
                    ` + ${o.complementos.length} peça(s) do projeto que ele não traz`}
                  {o.total ? ` = ${formatRange(o.total)}` : ""}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT[o.veredito].estilo}`}
              >
                {VERDICT[o.veredito].texto}
              </span>
            </div>
            {o.diferencas.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                {o.diferencas.map((d) => (
                  <li key={d}>
                    <Glossed text={d} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
