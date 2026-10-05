"use client";

import { ArrowLeftRight, Crosshair, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useWorkspace } from "./workspace";

/* Botões pequenos que ligam as abas ao 3D e ao diálogo de troca. */

export function ShowIn3DButton({ componenteId, nome }: { componenteId: string; nome: string }) {
  const { selecionar, selecionado } = useWorkspace();
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={() => selecionar(componenteId)}
      aria-pressed={selecionado === componenteId}
      aria-label={`Ver ${nome} no 3D`}
    >
      <Eye aria-hidden="true" /> Ver no 3D
    </Button>
  );
}

export function SwapButton({ slot, rotulo }: { slot: string; rotulo: string }) {
  const { abrirTroca } = useWorkspace();
  return (
    <Button
      variant="outline"
      size="xs"
      onClick={() => abrirTroca(slot)}
      aria-label={`Trocar ${rotulo}`}
    >
      <ArrowLeftRight aria-hidden="true" /> Trocar
    </Button>
  );
}

/** Destaca no 3D as peças de um passo (por categoria) ou de uma regra (por peça). */
export function HighlightButton({
  rotulo,
  categorias,
  componentes,
  children = "Destacar no 3D",
}: {
  rotulo: string;
  categorias?: string[];
  componentes?: string[];
  children?: React.ReactNode;
}) {
  const { destacar, destaque } = useWorkspace();
  const ativo = destaque?.rotulo === rotulo;
  return (
    <Button
      variant="ghost"
      size="xs"
      aria-pressed={ativo}
      onClick={() => destacar(ativo ? undefined : { rotulo, categorias, componentes })}
    >
      <Crosshair aria-hidden="true" /> {children}
    </Button>
  );
}
