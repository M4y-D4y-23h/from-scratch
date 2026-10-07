import { AlertOctagon, AlertTriangle, ExternalLink, Info, Scale } from "lucide-react";

import { dataBr } from "@/components/format";
import { Glossed } from "@/components/glossary/glossary";
import type { AlertLevel, SafetyAlert } from "@/domain/core/safety";

/*
 * Alertas de segurança (SPEC B.9) na interface: nível com cor e ícone, o que fazer e as fontes.
 * Usado na aba Segurança do projeto e nas opções do pedido. Os alertas vêm do domínio, nunca do LLM.
 */

export const ALERT_LEVELS: Array<{
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

export function SafetyAlertCard({
  alerta,
  comNivel = false,
}: {
  alerta: SafetyAlert;
  comNivel?: boolean;
}) {
  const nivel = ALERT_LEVELS.find((l) => l.nivel === alerta.nivel) ?? ALERT_LEVELS[3]!;
  const { Icon } = nivel;
  return (
    <div className={`rounded-lg border p-3 text-sm ${nivel.estilo}`}>
      <p className="flex items-start gap-2 font-medium">
        {comNivel && <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
        <span>
          {comNivel && <span className="sr-only">{nivel.titulo}: </span>}
          {alerta.titulo}
        </span>
      </p>
      <p className="mt-1">
        <Glossed text={alerta.texto} />
      </p>
      {alerta.acoes.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          {alerta.acoes.map((acao) => (
            <li key={acao}>
              <Glossed text={acao} />
            </li>
          ))}
        </ul>
      )}
      {(alerta.fontes.length > 0 || alerta.verificado_em) && (
        <div className="mt-2 text-xs text-muted-foreground">
          {alerta.fontes.length > 0 && (
            <ul className="space-y-0.5">
              {alerta.fontes.map((f) => (
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
          {alerta.verificado_em && <p>Conferido em {dataBr(alerta.verificado_em)}.</p>}
        </div>
      )}
    </div>
  );
}
