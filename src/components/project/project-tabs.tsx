"use client";

import {
  Calculator,
  Gauge,
  type LucideIcon,
  MapPin,
  ShieldAlert,
  Wallet,
  Wrench,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { isTab, TABS, type TabId } from "./tab-ids";
import { useActiveTab, useWorkspaceActions } from "./workspace";

/*
 * As seis abas da SPEC B.12, à direita do 3D. Cada aba é desenhada no navegador na primeira vez
 * que é aberta e continua montada (só escondida) depois: voltar a ela é instantâneo. O servidor
 * desenha só a aba inicial; os dados de todas chegam uma vez só (desempenho).
 */

export const TAB_INFO: Record<TabId, { rotulo: string; Icon: LucideIcon }> = {
  pecas: { rotulo: "Peças e Custos", Icon: Wallet },
  dificuldade: { rotulo: "Dificuldade", Icon: Gauge },
  locais: { rotulo: "Onde fazer", Icon: MapPin },
  montagem: { rotulo: "Montagem", Icon: Wrench },
  seguranca: { rotulo: "Segurança", Icon: ShieldAlert },
  calculos: { rotulo: "Cálculos", Icon: Calculator },
};

export function ProjectTabs({
  paineis,
  marcadores = {},
}: {
  paineis: Record<TabId, ReactNode>;
  /** Número pequeno ao lado do nome da aba (ex.: alertas de perigo). */
  marcadores?: Partial<Record<TabId, { texto: string; titulo: string }>>;
}) {
  const aba = useActiveTab();
  const { abrirAba } = useWorkspaceActions();
  const [abertas, setAbertas] = useState<ReadonlySet<TabId>>(() => new Set([aba]));
  // Aba aberta pela primeira vez: entra no conjunto das que ficam montadas.
  if (!abertas.has(aba)) setAbertas(new Set(abertas).add(aba));
  return (
    <Tabs value={aba} onValueChange={(v) => isTab(v) && abrirAba(v)} className="gap-4">
      <TabsList
        aria-label="Painéis do projeto"
        className="grid h-auto w-full grid-cols-3 gap-1 p-1 group-data-[orientation=horizontal]/tabs:h-auto"
      >
        {TABS.map((id) => {
          const { rotulo, Icon } = TAB_INFO[id];
          const m = marcadores[id];
          return (
            <TabsTrigger
              key={id}
              value={id}
              className="h-auto gap-1.5 px-1.5 py-2 text-xs sm:text-sm"
            >
              <Icon aria-hidden="true" />
              <span>{rotulo}</span>
              {m && (
                <span
                  title={m.titulo}
                  className="rounded-full bg-amber-200 px-1.5 text-[0.7rem] leading-4 font-semibold text-amber-950 dark:bg-amber-800 dark:text-amber-50"
                >
                  {m.texto}
                  <span className="sr-only"> ({m.titulo})</span>
                </span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {TABS.map((id) => (
        <TabsContent
          key={id}
          value={id}
          // Já aberta antes: fica montada e só é escondida (o `hidden` daqui vale sobre o do Radix).
          forceMount={abertas.has(id) ? true : undefined}
          hidden={id !== aba}
          className="space-y-6"
        >
          {abertas.has(id) && paineis[id]}
        </TabsContent>
      ))}
    </Tabs>
  );
}

/** Link para outra aba (ex.: "veja a aba Cálculos"), que funciona sem recarregar a página. */
export function TabLink({ aba, children }: { aba: TabId; children: ReactNode }) {
  const { abrirAba } = useWorkspaceActions();
  return (
    <button
      type="button"
      onClick={() => {
        abrirAba(aba);
        document.getElementById("paineis")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className="font-medium underline underline-offset-2"
    >
      {children}
    </button>
  );
}
