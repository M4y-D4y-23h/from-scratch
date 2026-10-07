"use client";

import { Clock, Wrench } from "lucide-react";

import { fmtHours } from "@/components/format";
import { Glossed } from "@/components/glossary/glossary";
import { LazyDetails } from "@/components/lazy-details";
import { purchaseOptions } from "@/domain/categories/drone/bom";
import type { LocationKind } from "@/domain/core/location";
import type { ProjectViewData } from "@/server/project-view/view";

import { TabLink } from "../project-tabs";
import { BuyLinks } from "./parts-costs-tab";

/*
 * Aba "Onde fazer" (SPEC B.12): cada passo e cada compra classificados em comprar pronto, em casa
 * na bancada, serviço externo e espaço aberto, com requisitos, tempo e ferramentas de cada lugar.
 */

const INTRO: Record<LocationKind, string> = {
  comprar_pronto: "Tudo o que se compra. Peças importadas levam semanas: compre antes de começar.",
  em_casa: "O que dá para fazer numa mesa em casa, com as ferramentas certas.",
  servico_externo: "O que exige máquina que quase ninguém tem em casa (impressão 3D, corte CNC).",
  espaco_aberto: "Testes e voos: o lugar certo faz parte da segurança.",
};

export function LocationsTab({ data }: { data: ProjectViewData }) {
  return (
    <section aria-labelledby="titulo-locais" className="space-y-4">
      <h3 id="titulo-locais" className="text-lg font-semibold">
        Onde fazer cada coisa
      </h3>
      {data.relatorio.locais.map((g) => (
        <article key={g.local} className="space-y-3 rounded-lg border p-4 text-sm">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-2 text-base font-semibold">
              <span aria-hidden="true" className="text-xl">
                {g.simbolo}
              </span>
              {g.rotulo}
            </h4>
            {g.passos.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock aria-hidden="true" className="size-3.5" />
                {fmtHours(g.horas)} em {g.passos.length} passo(s)
              </span>
            )}
          </header>
          <p className="text-muted-foreground">{INTRO[g.local]}</p>
          <div>
            <p className="font-medium">Requisitos</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {g.requisitos.map((r) => (
                <li key={r}>
                  <Glossed text={r} />
                </li>
              ))}
            </ul>
          </div>
          {g.ferramentas.length > 0 && (
            <p className="flex gap-1.5">
              <Wrench aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <span className="font-medium">Ferramentas:</span> {g.ferramentas.join(", ")}.
              </span>
            </p>
          )}
          {g.passos.length > 0 && (
            <LazyDetails summaryClassName="cursor-pointer font-medium" summary="Passos feitos aqui">
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted-foreground">
                {g.passos.map((p) => (
                  <li key={p.id}>{p.titulo}</li>
                ))}
              </ol>
            </LazyDetails>
          )}
          {g.compras && g.compras.length > 0 && (
            <LazyDetails
              summaryClassName="cursor-pointer font-medium"
              summary={`O que comprar e onde procurar (${g.compras.length})`}
            >
              <ul className="mt-2 space-y-2">
                {g.compras.map((c) => (
                  <li key={c.id} className="space-y-1">
                    <p>{c.nome}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <BuyLinks opcoes={purchaseOptions(c.onde)} />
                    </div>
                  </li>
                ))}
              </ul>
            </LazyDetails>
          )}
          {g.alertas.includes("regulamentacao") && (
            <p className="rounded-md bg-muted p-2 text-xs">
              Antes de voar ao ar livre, leia as regras da ANAC, do DECEA e da Anatel na aba{" "}
              <TabLink aba="seguranca">Segurança</TabLink>.
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
