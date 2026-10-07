import { CircleCheck, CircleHelp, MessagesSquare, OctagonX } from "lucide-react";
import Link from "next/link";

import { fmt, fmtHours, fmtMinutes, formatRange, unpricedNote } from "@/components/format";
import { Glossed } from "@/components/glossary/glossary";
import { Seal } from "@/components/seal";
import { TIER_LABEL } from "@/domain/categories/drone/build";
import { TIERS } from "@/domain/categories/drone/solver";
import type { VerificationStatus } from "@/domain/core/verification";
import type { ProjectViewData } from "@/server/project-view/view";

import { TabLink } from "./project-tabs";
import { ProjectVersions } from "./versions";

/*
 * Coluna da esquerda (SPEC B.12): no futuro, o pedido em linguagem natural e o tutor (Fases 4 e
 * 6). Nesta fase: o resumo do projeto com os números principais, a origem (build de referência ou
 * o seu projeto, com as versões) e onde o pedido e o tutor vão aparecer.
 */

const STATUS_STYLE = {
  compativel: {
    Icon: CircleCheck,
    estilo:
      "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-50",
  },
  incompleto: {
    Icon: CircleHelp,
    estilo:
      "border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
  },
  bloqueado: {
    Icon: OctagonX,
    estilo:
      "border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-50",
  },
} as const;

function Row({
  rotulo,
  valor,
  selo,
  nota,
}: {
  rotulo: string;
  valor: string;
  selo?: VerificationStatus;
  nota?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2 py-1.5">
      <dt className="text-muted-foreground">
        <Glossed text={rotulo} />
      </dt>
      <dd className="ml-auto flex items-center gap-1.5 text-right font-medium">
        {valor}
        {selo && <Seal status={selo} compacto />}
      </dd>
      {nota && <dd className="basis-full text-right text-xs text-muted-foreground">{nota}</dd>}
    </div>
  );
}

export function ProjectSummary({ data }: { data: ProjectViewData }) {
  const { auw, propulsion, flight } = data.relatorio.metricas;
  const st = STATUS_STYLE[data.status.tipo];
  const d = data.relatorio.dificuldade;
  return (
    <section aria-labelledby="titulo-resumo" className="space-y-3 rounded-xl border p-4">
      <h2 id="titulo-resumo" className="text-base font-semibold">
        Resumo
      </h2>
      <div role="status" className={`rounded-lg border p-3 text-sm ${st.estilo}`}>
        <p className="flex items-center gap-2 font-semibold">
          <st.Icon aria-hidden="true" className="size-4 shrink-0" />
          {data.status.titulo}
          <Seal status={data.status.selo} compacto className="ml-auto" />
        </p>
        <p className="mt-1 text-xs">
          <Glossed text={data.status.texto} />
        </p>
      </div>
      <dl className="divide-y text-sm">
        <Row
          rotulo="Peso total"
          valor={auw.massa_total_g !== undefined ? `${fmt(auw.massa_total_g, 0)} g` : "sem dado"}
          selo={auw.selo}
        />
        <Row
          rotulo="TWR"
          valor={propulsion.twr !== undefined ? fmt(propulsion.twr, 2) : "sem dado"}
          selo={propulsion.selo}
        />
        <Row
          rotulo="Pairar (acelerador)"
          valor={
            propulsion.hover
              ? `${propulsion.hover.precisao === "abaixo_da_tabela" ? "até " : ""}${fmt(propulsion.hover.throttle_pct, 0)}%`
              : "sem dado"
          }
          selo={propulsion.selo}
        />
        <Row
          rotulo="Tempo de voo"
          valor={fmtMinutes(flight.min_minutos, flight.max_minutos)}
          selo={flight.selo}
        />
        <Row
          rotulo="Custo total"
          valor={formatRange(data.relatorio.custos.total)}
          selo={data.relatorio.custos.total.status}
          nota={unpricedNote(data.relatorio.custos.sem_preco.length)}
        />
        <Row rotulo="Dificuldade" valor={`${d.rotulo} (${fmt(d.nota, 2)})`} />
        <Row rotulo="Horas (aprender e fazer)" valor={fmtHours(d.horas_totais)} selo="estimativa" />
      </dl>
      <p className="text-xs text-muted-foreground">
        Contas e regras na aba <TabLink aba="calculos">Cálculos</TabLink>; custos na aba{" "}
        <TabLink aba="pecas">Peças e Custos</TabLink>.
      </p>
    </section>
  );
}

export function ProjectOriginCard({ data }: { data: ProjectViewData }) {
  const o = data.origem;
  if (o.tipo === "referencia") {
    return (
      <section aria-labelledby="titulo-origem" className="space-y-3 rounded-xl border p-4 text-sm">
        <h2 id="titulo-origem" className="text-base font-semibold">
          Build de referência
        </h2>
        <p className="text-muted-foreground">
          <Glossed text={data.arquetipo.descricao} />
        </p>
        <p>
          <span className="font-medium">Para quem:</span>{" "}
          <Glossed text={data.arquetipo.para_quem} />
        </p>
        <nav aria-label="Faixa de preço">
          <ul className="flex flex-wrap gap-1.5">
            {TIERS.map((t) => (
              <li key={t}>
                <Link
                  href={`/referencia/${data.arquetipo.id}/${t}`}
                  aria-current={t === o.faixa ? "page" : undefined}
                  className="inline-block rounded-md border px-2.5 py-1 hover:bg-accent aria-[current=page]:border-primary aria-[current=page]:bg-accent aria-[current=page]:font-semibold"
                >
                  {TIER_LABEL[t]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-xs text-muted-foreground">
          Montado pelo motor de cálculo com peças reais do catálogo. Use &ldquo;Trocar&rdquo; numa
          peça para criar o seu projeto, com as trocas salvas em versões.
        </p>
      </section>
    );
  }
  return <ProjectVersions data={data} origem={o} />;
}

/** O pedido que criou o projeto (ou o atalho para fazer um) e o tutor, que vem na Fase 6. */
export function PromptCard({ data }: { data: ProjectViewData }) {
  const pedido = data.origem.tipo === "projeto" ? data.origem.pedido : undefined;
  return (
    <section
      aria-labelledby="titulo-pedido"
      className="space-y-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground"
    >
      <h2
        id="titulo-pedido"
        className="flex items-center gap-2 text-base font-semibold text-foreground"
      >
        <MessagesSquare aria-hidden="true" className="size-4" />
        {pedido ? "Seu pedido" : "Pedido e tutor"}
      </h2>
      {pedido ? (
        <blockquote className="border-l-2 pl-3 text-foreground italic">{pedido}</blockquote>
      ) : (
        <p>
          Prefere descrever com as suas palavras?{" "}
          <Link href="/novo" className="underline underline-offset-2">
            Faça um pedido
          </Link>{" "}
          e escolha entre até três opções.
        </p>
      )}
      <p>
        {pedido && (
          <>
            <Link href="/novo" className="underline underline-offset-2">
              Fazer outro pedido
            </Link>
            .{" "}
          </>
        )}
        Em breve: tirar dúvidas com um tutor que conhece este projeto e olha fotos (Fase 6).
      </p>
    </section>
  );
}
