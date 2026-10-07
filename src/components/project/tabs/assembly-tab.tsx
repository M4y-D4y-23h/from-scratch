"use client";

import { Clock, Lock } from "lucide-react";

import { fmt } from "@/components/format";
import { Glossed } from "@/components/glossary/glossary";
import { LazyDetails } from "@/components/lazy-details";
import { DOMAIN_LABEL } from "@/domain/core/difficulty";
import { LOCATION_LABEL } from "@/domain/core/location";
import type { ProjectViewData } from "@/server/project-view/view";

import { HighlightButton } from "../workspace-buttons";

/*
 * Aba "Montagem" (prévia): os passos do guia que valem para este projeto e os parâmetros do
 * firmware. O guia interativo, com checklists de segurança bloqueantes e progresso salvo, é a
 * Fase 5 (SPEC B.13).
 */

const minutos = ([a, b]: readonly [number, number]) => {
  const f = (m: number) => (m >= 60 ? `${fmt(m / 60)} h` : `${m} min`);
  return a === b ? f(a) : `${f(a)} a ${f(b)}`;
};

export function AssemblyTab({ data }: { data: ProjectViewData }) {
  const passos = data.relatorio.passos;
  const checkpoints = passos.filter((p) => p.checkpoint).length;
  return (
    <>
      <section aria-labelledby="titulo-montagem" className="space-y-3">
        <h3 id="titulo-montagem" className="text-lg font-semibold">
          Passo a passo ({passos.length} passos)
        </h3>
        <p className="rounded-md border border-dashed p-3 text-sm">
          Prévia do guia. Na <strong>Fase 5</strong> cada passo vira uma tela, com os checklists de
          segurança que precisam ser marcados para avançar ({checkpoints} neste projeto), o
          progresso salvo e o tutor. Abaixo, o que cada passo pede.
        </p>
        <ol className="space-y-2">
          {passos.map((p, i) => (
            <li key={p.id} className="rounded-lg border text-sm">
              <LazyDetails
                summaryClassName="flex cursor-pointer list-none items-start gap-3 p-3"
                summary={
                  <>
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {i + 1}
                    </span>
                    <span className="flex-1 space-y-1">
                      <span className="block font-medium">{p.titulo}</span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          <span aria-hidden="true">{LOCATION_LABEL[p.local].simbolo}</span>{" "}
                          {LOCATION_LABEL[p.local].rotulo}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock aria-hidden="true" className="size-3" />
                          {minutos(p.tempo_min)}
                        </span>
                        {p.checkpoint && (
                          <span className="flex items-center gap-1 font-medium text-amber-800 dark:text-amber-300">
                            <Lock aria-hidden="true" className="size-3" />
                            Checklist de segurança
                          </span>
                        )}
                        {p.opcional && <span>opcional</span>}
                      </span>
                    </span>
                  </>
                }
              >
                <div className="space-y-2 border-t px-3 pt-2 pb-3">
                  <p>
                    <span className="font-medium">Objetivo:</span> <Glossed text={p.objetivo} />
                  </p>
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Por que importa:</span>{" "}
                    <Glossed text={p.por_que_importa} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Exige:{" "}
                    {Object.entries(p.dominios)
                      .map(
                        ([d, n]) => `${DOMAIN_LABEL[d as keyof typeof DOMAIN_LABEL]} (nível ${n})`,
                      )
                      .join("; ")}
                  </p>
                  {p.checkpoint && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/40">
                      <p className="font-medium">Checklist antes de avançar</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5">
                        {p.checkpoint.itens.map((item) => (
                          <li key={item}>
                            <Glossed text={item} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <p className="font-medium">Como saber que deu certo</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {p.como_saber_que_deu_certo.map((x) => (
                        <li key={x}>
                          <Glossed text={x} />
                        </li>
                      ))}
                    </ul>
                  </div>
                  {p.erros_comuns.length > 0 && (
                    <div>
                      <p className="font-medium">Erros comuns</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                        {p.erros_comuns.map((x) => (
                          <li key={x}>
                            <Glossed text={x} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {p.riscos.length > 0 && (
                    <div>
                      <p className="font-medium">Riscos</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                        {p.riscos.map((x) => (
                          <li key={x}>
                            <Glossed text={x} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {p.pecas.length > 0 && (
                    <HighlightButton rotulo={`Passo: ${p.titulo}`} categorias={p.pecas}>
                      Destacar as peças deste passo no 3D
                    </HighlightButton>
                  )}
                </div>
              </LazyDetails>
            </li>
          ))}
        </ol>
      </section>

      {data.relatorio.parametros.length > 0 && (
        <section aria-labelledby="titulo-parametros" className="space-y-2">
          <h3 id="titulo-parametros" className="text-lg font-semibold">
            Parâmetros do {data.arquetipo.firmware}
          </h3>
          <p className="text-sm text-muted-foreground">
            Valores do perfil versionado no catálogo (nomes exatamente como no programa de
            configuração). Os calculados dependem das peças deste projeto.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Parâmetros de firmware do projeto</caption>
              <thead className="bg-muted/60 text-xs">
                <tr>
                  <th scope="col" className="p-2">
                    Parâmetro
                  </th>
                  <th scope="col" className="p-2">
                    Valor
                  </th>
                  <th scope="col" className="p-2">
                    Para quê
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.relatorio.parametros.map((p) => (
                  <tr key={p.nome} className="align-top">
                    <th scope="row" className="p-2 font-mono text-xs font-medium">
                      {p.nome}
                    </th>
                    <td className="p-2 font-mono text-xs whitespace-nowrap">
                      {String(p.valor)}
                      {p.unidade ? ` ${p.unidade}` : ""}
                      {p.calculado && (
                        <span className="block font-sans text-[0.7rem] text-muted-foreground">
                          calculado
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{p.explicacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.relatorio.parametros_pendentes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Sem dado para calcular: {data.relatorio.parametros_pendentes.join(", ")}.
            </p>
          )}
        </section>
      )}
    </>
  );
}
