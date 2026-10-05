import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { TIER_LABEL } from "@/domain/categories/drone/build";
import type { Component } from "@/domain/categories/drone/schema";
import type { ProjectViewData } from "@/server/project-view/view";

import { ProjectTabs } from "./project-tabs";
import { ProjectViewer } from "./project-viewer";
import { FuturePromptCard, ProjectOriginCard, ProjectSummary } from "./sidebar";
import { SwapDialog, type SwapOrigin } from "./swap-dialog";
import { AssemblyTab } from "./tabs/assembly-tab";
import { CalculationsTab } from "./tabs/calculations-tab";
import { DifficultyTab } from "./tabs/difficulty-tab";
import { LocationsTab } from "./tabs/locations-tab";
import { PartsCostsTab } from "./tabs/parts-costs-tab";
import { SafetyTab } from "./tabs/safety-tab";
import type { TabId } from "./tab-ids";
import { WorkspaceNotice, WorkspaceProvider } from "./workspace";

/*
 * Página de um projeto (SPEC B.12). Desktop largo: à esquerda o resumo (e, nas próximas fases, o
 * pedido e o tutor), no centro o 3D, à direita as abas. Em telas menores as colunas empilham.
 */

export function ProjectPage({
  data,
  aba,
  frames,
}: {
  data: ProjectViewData;
  aba: TabId;
  /** Frames do catálogo para o "experimentar" do 3D. */
  frames: Component[];
}) {
  const origem: SwapOrigin =
    data.origem.tipo === "referencia"
      ? { tipo: "referencia", arquetipo_id: data.arquetipo.id, faixa: data.origem.faixa }
      : { tipo: "projeto", id: data.origem.id };
  const trocaveis = new Set(
    data.alternativas
      .filter((a) => a.compativeis.length > 0 || a.incompativeis.some((c) => c.sugestao))
      .map((a) => a.slot),
  );
  const pecaSlot: Record<string, string> = {};
  for (const item of data.build.itens) {
    if (trocaveis.has(item.slot)) pecaSlot[item.componente.id] = item.slot;
  }
  const perigos = data.relatorio.alertas.filter((a) => a.nivel === "perigo").length;
  const avisos = data.relatorio.validacao.resultados.filter((r) => r.status !== "passou").length;
  const titulo = data.origem.tipo === "projeto" ? data.origem.titulo : data.arquetipo.nome;

  return (
    <WorkspaceProvider abaInicial={aba}>
      <SiteHeader largo atual={data.origem.tipo === "projeto" ? "projeto" : undefined} />
      <main id="conteudo" className="mx-auto max-w-[1800px] space-y-5 px-4 py-5">
        <div className="space-y-1">
          <nav aria-label="Caminho" className="text-sm text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-1">
              <li>
                <Link href="/" className="hover:underline">
                  Início
                </Link>
              </li>
              <ChevronRight aria-hidden="true" className="size-3.5" />
              <li>{data.origem.tipo === "projeto" ? "Seus projetos" : "Drones de referência"}</li>
            </ol>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{titulo}</h1>
          <p className="text-sm text-muted-foreground">
            {data.arquetipo.firmware}
            {data.origem.tipo === "referencia"
              ? ` · build de referência, faixa ${TIER_LABEL[data.origem.faixa].toLowerCase()}`
              : ` · versão ${data.origem.versao}${data.origem.versao === data.origem.versao_atual ? " (atual)" : ""}`}
            {" · "}calculado pelo motor de cálculo, sem IA
          </p>
        </div>
        <WorkspaceNotice />

        {/*
          Ordem no celular: resumo, 3D, abas e, por último, a origem (versões ou faixas).
          Desktop largo (xl): resumo e origem empilhados à esquerda, 3D no centro, abas à direita.
        */}
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-[17rem_minmax(0,1fr)_minmax(0,1fr)] xl:grid-rows-[auto_1fr] 2xl:grid-cols-[19rem_minmax(0,1fr)_minmax(30rem,40rem)]">
          <div className="order-1 xl:col-start-1 xl:row-start-1">
            <ProjectSummary data={data} />
          </div>
          <div className="order-4 space-y-4 lg:order-2 xl:col-start-1 xl:row-start-2 xl:self-start">
            <ProjectOriginCard data={data} />
            <FuturePromptCard />
          </div>
          <div className="order-2 lg:sticky lg:top-4 lg:order-3 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-1 xl:col-start-2 xl:row-span-2 xl:row-start-1">
            <ProjectViewer
              nome={titulo}
              firmware={data.arquetipo.firmware}
              build={data.build}
              partes={data.partes}
              passos={data.relatorio.passos.map((p) => ({
                id: p.id,
                titulo: p.titulo,
                pecas: p.pecas,
              }))}
              frames={frames}
              trocaveis={pecaSlot}
            />
          </div>
          <div
            id="paineis"
            className="order-3 min-w-0 scroll-mt-4 lg:order-4 xl:col-start-3 xl:row-span-2 xl:row-start-1"
          >
            <ProjectTabs
              paineis={{
                pecas: <PartsCostsTab data={data} />,
                dificuldade: <DifficultyTab data={data} />,
                locais: <LocationsTab data={data} />,
                montagem: <AssemblyTab data={data} />,
                seguranca: <SafetyTab data={data} />,
                calculos: <CalculationsTab data={data} />,
              }}
              marcadores={{
                seguranca:
                  perigos > 0
                    ? { texto: String(perigos), titulo: `${perigos} alertas de perigo` }
                    : undefined,
                calculos:
                  avisos > 0
                    ? { texto: String(avisos), titulo: `${avisos} regras com aviso ou sem dado` }
                    : undefined,
              }}
            />
          </div>
        </div>
        <SwapDialog origem={origem} alternativas={data.alternativas} />
      </main>
    </WorkspaceProvider>
  );
}
