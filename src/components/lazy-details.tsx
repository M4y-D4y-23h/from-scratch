"use client";

import { type ReactNode, useState } from "react";

/**
 * Um `<details>` que só monta o conteúdo na primeira vez que é aberto (e o mantém depois). Listas
 * longas de blocos fechados (passos, regras, peças) deixam de montar centenas de elementos que
 * ninguém está vendo: a aba abre bem mais rápido (desempenho).
 */
export function LazyDetails({
  summary,
  children,
  className,
  summaryClassName,
  open = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  summaryClassName?: string;
  /** Começa aberto. */
  open?: boolean;
}) {
  const [montado, setMontado] = useState(open);
  return (
    <details
      className={className}
      open={open || undefined}
      onToggle={(e) => {
        if (e.currentTarget.open) setMontado(true);
      }}
    >
      <summary className={summaryClassName}>{summary}</summary>
      {montado && children}
    </details>
  );
}
