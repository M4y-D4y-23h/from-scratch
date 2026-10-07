"use client";

import { ALERT_LEVELS, SafetyAlertCard } from "@/components/safety-alerts";
import { REGULATORY_DISCLAIMER } from "@/domain/core/safety";
import type { ProjectViewData } from "@/server/project-view/view";

/*
 * Aba "Segurança" (SPEC B.9): todos os alertas do projeto, do mais grave ao informativo, com o que
 * fazer e as fontes. Os alertas vêm do domínio (peças e projeto), não do LLM.
 */

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
      {ALERT_LEVELS.map(({ nivel, titulo, Icon }) => {
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
                <li key={a.id}>
                  <SafetyAlertCard alerta={a} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
