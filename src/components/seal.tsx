import { cn } from "cn";

import { SEAL, type VerificationStatus } from "@/domain/core/verification";

/*
 * Selo de confiança (SPEC B.1.2): todo dado da interface carrega um. O texto completo fica no
 * título (passar o mouse) e para leitores de tela.
 */

const MEANING: Record<VerificationStatus, string> = {
  verificado: "dado conferido numa fonte com link e data",
  estimativa: "preço estimado ou valor calculado; o real pode variar",
  nao_verificado: "dado que ninguém conferiu ainda; confira antes de comprar",
};

const STYLE: Record<VerificationStatus, string> = {
  verificado:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100",
  estimativa:
    "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100",
  nao_verificado:
    "border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
};

export function Seal({
  status,
  compacto = false,
  className,
}: {
  status: VerificationStatus;
  /** Só o símbolo (o rótulo continua para leitores de tela e no título). */
  compacto?: boolean;
  className?: string;
}) {
  const s = SEAL[status];
  return (
    <span
      title={`${s.rotulo}: ${MEANING[status]}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs leading-none font-medium whitespace-nowrap",
        STYLE[status],
        className,
      )}
    >
      <span aria-hidden="true">{s.simbolo}</span>
      <span className={compacto ? "sr-only" : undefined}>{s.rotulo}</span>
    </span>
  );
}

export const SEAL_MEANING = MEANING;
