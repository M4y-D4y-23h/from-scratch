"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

import type { TabId } from "./tab-ids";

/*
 * Estado compartilhado da página do projeto: a aba aberta, a peça selecionada no 3D, as peças
 * destacadas (de um passo ou de uma regra) e o slot cuja troca está aberta. Assim a lista de
 * peças, as abas e o 3D conversam sem passar dados pelo servidor.
 *
 * Desempenho: são três contextos separados. As ações nunca mudam; a aba aberta fica sozinha
 * (trocar de aba redesenha só as abas, não o 3D nem os botões das listas); o resto do estado
 * (seleção, destaque, troca, aviso) é usado só por quem precisa dele.
 */

export type Destaque = {
  /** O que está destacado (ex.: "Passo 7: soldar os motores"). */
  rotulo: string;
  categorias?: readonly string[];
  componentes?: readonly string[];
};

type Aviso = { tipo: "ok" | "erro"; texto: string };

type WorkspaceActions = {
  abrirAba: (aba: TabId) => void;
  selecionar: (componenteId: string | undefined) => void;
  /** `rolar: false` destaca sem levar a tela até o 3D (ex.: o passo aberto no guia). */
  destacar: (d: Destaque | undefined, opcoes?: { rolar?: boolean }) => void;
  abrirTroca: (slot: string) => void;
  fecharTroca: () => void;
  notificar: (aviso: Aviso | undefined) => void;
};

type WorkspaceState = {
  selecionado?: string;
  destaque?: Destaque;
  trocaSlot?: string;
  /** Mensagem do último salvamento (ex.: "Versão 3 salva"). */
  aviso?: Aviso;
};

type WorkspaceValue = WorkspaceActions & WorkspaceState;

const ActionsContext = createContext<WorkspaceActions | null>(null);
const StateContext = createContext<WorkspaceState | null>(null);
const TabContext = createContext<TabId | null>(null);

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
  const destacar = useCallback((d: Destaque | undefined, opcoes?: { rolar?: boolean }) => {
    setDestaque(d);
    if (d && opcoes?.rolar !== false) scrollToViewer();
  }, []);
  const abrirTroca = useCallback((slot: string) => setTrocaSlot(slot), []);
  const fecharTroca = useCallback(() => setTrocaSlot(undefined), []);

  const actions = useMemo<WorkspaceActions>(
    () => ({ abrirAba, selecionar, destacar, abrirTroca, fecharTroca, notificar: setAviso }),
    [abrirAba, selecionar, destacar, abrirTroca, fecharTroca],
  );
  const state = useMemo<WorkspaceState>(
    () => ({ selecionado, destaque, trocaSlot, aviso }),
    [selecionado, destaque, trocaSlot, aviso],
  );
  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>
        <TabContext.Provider value={aba}>{children}</TabContext.Provider>
      </StateContext.Provider>
    </ActionsContext.Provider>
  );
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

/** Só as ações (nunca mudam: quem usa só isto não é redesenhado). */
export function useWorkspaceActions(): WorkspaceActions {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error("useWorkspaceActions fora do WorkspaceProvider");
  return ctx;
}

/** A aba aberta (só as abas precisam dela). */
export function useActiveTab(): TabId {
  const ctx = useContext(TabContext);
  if (!ctx) throw new Error("useActiveTab fora do WorkspaceProvider");
  return ctx;
}

/** Ações + seleção, destaque, troca e aviso (sem a aba aberta). */
export function useWorkspace(): WorkspaceValue {
  const actions = useWorkspaceActions();
  const state = useContext(StateContext);
  if (!state) throw new Error("useWorkspace fora do WorkspaceProvider");
  return useMemo(() => ({ ...actions, ...state }), [actions, state]);
}
