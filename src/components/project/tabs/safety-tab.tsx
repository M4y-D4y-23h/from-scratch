"use client";

import { AlertOctagon, AlertTriangle, ExternalLink, Info, Scale } from "lucide-react";

import { dataBr } from "@/components/format";
import { Glossed } from "@/components/glossary/glossary";
import { type AlertLevel, REGULATORY_DISCLAIMER } from "@/domain/core/safety";
import type { ProjectViewData } from "@/server/project-view/view";

/*
 * Aba "Segurança" (SPEC B.9): todos os alertas do projeto, do mais grave ao informativo, com o que
 * fazer e as fontes. Os alertas vêm do domínio (peças e projeto), não do LLM.
 */

const LEVELS: Array<{
  nivel: AlertLevel;
  titulo: string;
  Icon: typeof AlertOctagon;
  estilo: string;
}> = [
  {
    nivel: "perigo",
    titulo: "Perigo: pode ferir alguém ou causar incêndio",
    Icon: AlertOctagon,
    estilo: "border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30",
  },
  {
    nivel: "atencao",
    titulo: "Atenção: pode estragar peças ou derrubar o drone",
    Icon: AlertTriangle,
    estilo: "border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30",
  },
  {
    nivel: "regulatorio",
    titulo: "Regras (ANAC, DECEA, Anatel)",
    Icon: Scale,
    estilo: "border-sky-300 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/30",
  },
  {
    nivel: "info",
    titulo: "Boas práticas",
    Icon: Info,
    estilo: "border-border bg-muted/40",
  },
];

export function SafetyTab({ data }: { data: ProjectViewData }) {
  const alertas = data.relatorio.alertas;
  return (
    <section aria-labelledby="titulo-seguranca" className="space-y-5">
      <div>
        <h3 id="titulo-seguranca" className="text-lg font-semibold">
          Riscos e regras ({alertas.length} alertas)
        </h3>
        <p className="text-sm text-muted-foreground">{REGULATORY_DISCLAIMER}</p>
      </div>
      {LEVELS.map(({ nivel, titulo, Icon, estilo }) => {
        const doNivel = alertas.filter((a) => a.nivel === nivel);
        if (doNivel.length === 0) return null;
        return (
          <div key={nivel} className="space-y-2">
            <h4 className="flex items-center gap-2 font-semibold">
              <Icon aria-hidden="true" className="size-4" />
              {titulo}
            </h4>
            <ul className="space-y-2">
              {doNivel.map((a) => (
                <li key={a.id} className={`rounded-lg border p-3 text-sm ${estilo}`}>
                  <p className="font-medium">{a.titulo}</p>
                  <p className="mt-1">
                    <Glossed text={a.texto} />
                  </p>
                  {a.acoes.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5">
                      {a.acoes.map((acao) => (
                        <li key={acao}>
                          <Glossed text={acao} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {(a.fontes.length > 0 || a.verificado_em) && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {a.fontes.length > 0 && (
                        <ul className="space-y-0.5">
                          {a.fontes.map((f) => (
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
                            </li>
                          ))}
                        </ul>
                      )}
                      {a.verificado_em && <p>Conferido em {dataBr(a.verificado_em)}.</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
