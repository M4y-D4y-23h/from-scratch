"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

import type { TabId } from "./tab-ids";

/*
 * Estado compartilhado da página do projeto: a aba aberta, a peça selecionada no 3D, as peças
 * destacadas (de um passo ou de uma regra) e o slot cuja troca está aberta. Assim a lista de
 * peças, as abas e o 3D conversam sem passar dados pelo servidor.
 */

export type Destaque = {
  /** O que está destacado (ex.: "Passo 7: soldar os motores"). */
  rotulo: string;
  categorias?: readonly string[];
  componentes?: readonly string[];
};

type WorkspaceValue = {
  aba: TabId;
  abrirAba: (aba: TabId) => void;
  selecionado?: string;
  selecionar: (componenteId: string | undefined) => void;
  destaque?: Destaque;
  destacar: (d: Destaque | undefined) => void;
  trocaSlot?: string;
  abrirTroca: (slot: string) => void;
  fecharTroca: () => void;
  /** Mensagem do último salvamento (ex.: "Versão 3 salva"). */
  aviso?: { tipo: "ok" | "erro"; texto: string };
  notificar: (aviso: { tipo: "ok" | "erro"; texto: string } | undefined) => void;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

/** Mostra o 3D (no celular ele fica acima das abas). */
function scrollToViewer() {
  document.getElementById("visualizador")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

export function WorkspaceProvider({
  abaInicial,
  children,
}: {
  abaInicial: TabId;
  children: ReactNode;
}) {
  const [aba, setAba] = useState<TabId>(abaInicial);
  const [selecionado, setSelecionado] = useState<string>();
  const [destaque, setDestaque] = useState<Destaque>();
  const [trocaSlot, setTrocaSlot] = useState<string>();
  const [aviso, setAviso] = useState<WorkspaceValue["aviso"]>();

  const abrirAba = useCallback((nova: TabId) => {
    setAba(nova);
    // A aba fica no endereço (dá para voltar a ela e compartilhar o link), sem recarregar.
    const url = new URL(window.location.href);
    url.searchParams.set("aba", nova);
    window.history.replaceState(window.history.state, "", url);
  }, []);
  const selecionar = useCallback((id: string | undefined) => {
    setSelecionado(id);
    if (id) scrollToViewer();
  }, []);
  const destacar = useCallback((d: Destaque | undefined) => {
    setDestaque(d);
    if (d) scrollToViewer();
  }, []);
  const abrirTroca = useCallback((slot: string) => setTrocaSlot(slot), []);
  const fecharTroca = useCallback(() => setTrocaSlot(undefined), []);

  const value = useMemo(
    () => ({
      aba,
      abrirAba,
      selecionado,
      selecionar,
      destaque,
      destacar,
      trocaSlot,
      abrirTroca,
      fecharTroca,
      aviso,
      notificar: setAviso,
    }),
    [
      aba,
      abrirAba,
      selecionado,
      selecionar,
      destaque,
      destacar,
      trocaSlot,
      abrirTroca,
      fecharTroca,
      aviso,
    ],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/** Mensagem do último salvamento, em qualquer lugar da página. */
export function WorkspaceNotice() {
  const { aviso, notificar } = useWorkspace();
  if (!aviso) return null;
  return (
    <div
      role={aviso.tipo === "erro" ? "alert" : "status"}
      className={`flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${
        aviso.tipo === "erro"
          ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
          : "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-50"
      }`}
    >
      <p>{aviso.texto}</p>
      <button
        type="button"
        onClick={() => notificar(undefined)}
        className="shrink-0 text-xs underline underline-offset-2"
      >
        Fechar
      </button>
    </div>
  );
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace fora do WorkspaceProvider");
  return ctx;
}
