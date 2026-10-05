"use client";

import { useOptimistic, useTransition } from "react";

import { setToolOwnedAction } from "@/server/actions/projects";

import { useWorkspace } from "./workspace";

/*
 * "Já tenho esta ferramenta" (SPEC B.6): tira a ferramenta do custo deste e de todos os projetos.
 * O servidor guarda a escolha e recalcula os totais.
 */
export function ToolOwnedToggle({
  ferramentaId,
  nome,
  jaTenho,
}: {
  ferramentaId: string;
  nome: string;
  jaTenho: boolean;
}) {
  const ws = useWorkspace();
  const [pendente, startTransition] = useTransition();
  const [marcado, setMarcado] = useOptimistic(jaTenho);
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium">
      <input
        type="checkbox"
        checked={marcado}
        disabled={pendente}
        aria-label={`Já tenho: ${nome}`}
        onChange={(e) => {
          const valor = e.target.checked;
          startTransition(async () => {
            setMarcado(valor);
            const r = await setToolOwnedAction(ferramentaId, valor);
            ws.notificar(
              r.ok ? { tipo: "ok", texto: r.mensagem } : { tipo: "erro", texto: r.erro },
            );
          });
        }}
        className="size-4 accent-primary"
      />
      Já tenho
    </label>
  );
}
