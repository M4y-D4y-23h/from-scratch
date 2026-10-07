"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

import { guideState, type StepProgress } from "@/domain/categories/drone/guide";
import type { BuildStepTemplate } from "@/domain/categories/drone/schema";

/*
 * Progresso do guia compartilhado na página: o guia (aba Montagem) grava e o marcador da aba
 * acompanha na hora, sem recarregar a página.
 */

type GuideProgressValue = {
  progresso: StepProgress[];
  setProgresso: (p: StepProgress[]) => void;
};

const GuideProgressContext = createContext<GuideProgressValue | null>(null);

export function GuideProgressProvider({
  inicial,
  children,
}: {
  inicial: StepProgress[];
  children: ReactNode;
}) {
  const [progresso, setProgresso] = useState(inicial);
  const valor = useMemo(() => ({ progresso, setProgresso }), [progresso]);
  return <GuideProgressContext.Provider value={valor}>{children}</GuideProgressContext.Provider>;
}

export function useGuideProgress(): GuideProgressValue {
  const ctx = useContext(GuideProgressContext);
  if (!ctx) throw new Error("useGuideProgress fora do GuideProgressProvider");
  return ctx;
}

/** "12/26" ao lado do nome da aba Montagem. */
export function GuideTabMarker({ passos }: { passos: readonly BuildStepTemplate[] }) {
  const { progresso } = useGuideProgress();
  const estado = useMemo(() => guideState(passos, progresso), [passos, progresso]);
  const titulo = `${estado.feitos} de ${estado.obrigatorios} passos feitos`;
  return (
    <span
      title={titulo}
      className={`rounded-full px-1.5 text-[0.7rem] leading-4 font-semibold ${
        estado.concluido
          ? "bg-emerald-200 text-emerald-950 dark:bg-emerald-800 dark:text-emerald-50"
          : "bg-muted-foreground/15 text-foreground"
      }`}
    >
      {estado.feitos}/{estado.obrigatorios}
      <span className="sr-only"> ({titulo})</span>
    </span>
  );
}
