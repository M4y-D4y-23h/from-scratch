"use client";

import { CheckCircle2, Circle, Hammer, Loader2, Lock, PartyPopper, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { buildGuide, type GuideStep, guideState } from "@/domain/categories/drone/guide";
import { guideAction } from "@/server/actions/guide";
import { startFromReferenceAction } from "@/server/actions/projects";
import type { ProjectViewData } from "@/server/project-view/view";

import { useGuideProgress } from "../guide/guide-progress";
import { GuideStepView, minutos, type StepMode } from "../guide/guide-step";
import { useActiveTab, useWorkspaceActions } from "../workspace";

/*
 * Aba "Montagem" (SPEC B.13): o guia passo a passo do projeto, com os checklists de segurança
 * que precisam ser confirmados para avançar (SPEC B.9), o progresso salvo por projeto e as peças
 * do passo destacadas no 3D. Abaixo, os parâmetros do firmware.
 */

function setStepInUrl(id: string) {
  const url = new URL(window.location.href);
  if (url.searchParams.get("passo") === id) return;
  url.searchParams.set("passo", id);
  window.history.replaceState(window.history.state, "", url);
}

export function AssemblyTab({
  data,
  passoInicial,
}: {
  data: ProjectViewData;
  passoInicial?: string;
}) {
  const guia = useMemo(
    () =>
      buildGuide({
        passos: data.relatorio.passos,
        build: data.build,
        parametros: data.relatorio.parametros,
        alertas: data.relatorio.alertas,
        ferramentas: data.ferramentas.map((t) => ({ id: t.id, nome: t.nome })),
      }),
    [data],
  );
  // Progresso salvo (vazio num build de referência), compartilhado com o marcador da aba.
  const { progresso: salvo, setProgresso: setSalvo } = useGuideProgress();
  const estado = useMemo(() => guideState(guia, salvo), [guia, salvo]);
  const [atualId, setAtualId] = useState<string | undefined>(() =>
    passoInicial && guia.some((p) => p.id === passoInicial)
      ? passoInicial
      : (estado.atual ?? guia[0]?.id),
  );
  const [ocupado, startTransition] = useTransition();
  const [recomecar, setRecomecar] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  const navegou = useRef(false);
  const ws = useWorkspaceActions();
  const aba = useActiveTab();

  const origem = data.origem;
  const projetoId = origem.tipo === "projeto" ? origem.id : undefined;
  const modo: StepMode =
    origem.tipo === "referencia"
      ? {
          tipo: "leitura",
          motivo:
            'Este é o drone de referência: dá para ler o guia inteiro. Para marcar os passos e salvar o progresso, clique em "Começar a montar" no alto desta aba.',
        }
      : origem.versao !== origem.versao_atual
        ? {
            tipo: "leitura",
            motivo: `Você está vendo a versão ${origem.versao}. O progresso do guia segue a versão atual (${origem.versao_atual}).`,
          }
        : { tipo: "editavel" };

  // Se uma troca de peça tirou o passo aberto do guia, volta para onde a pessoa parou.
  const aberto = guia.findIndex((p) => p.id === atualId);
  const indice =
    aberto >= 0
      ? aberto
      : Math.max(
          0,
          guia.findIndex((p) => p.id === estado.atual),
        );
  const passo = guia[indice];

  // O passo aberto fica no endereço e as peças dele aparecem destacadas no 3D (sem rolar a
  // página), enquanto a aba Montagem estiver aberta.
  useEffect(() => {
    if (aba !== "montagem" || !passo) return;
    setStepInUrl(passo.id);
    ws.destacar(
      passo.pecas.length > 0
        ? { rotulo: `Passo: ${passo.titulo}`, categorias: passo.pecas }
        : undefined,
      { rolar: false },
    );
  }, [aba, passo, ws]);

  // Ao trocar de passo por um clique, o foco vai para o título dele (teclado e leitor de tela).
  useEffect(() => {
    if (navegou.current) titulo.current?.focus();
  }, [atualId]);

  function ir(id: string) {
    navegou.current = true;
    setAtualId(id);
  }

  function rodar(acao: Parameters<typeof guideAction>[1], depois?: () => void) {
    if (!projetoId) return;
    startTransition(async () => {
      const r = await guideAction(projetoId, acao);
      if (!r.ok) {
        ws.notificar({ tipo: "erro", texto: r.erro });
        return;
      }
      setSalvo(r.progresso);
      depois?.();
    });
  }

  if (!passo) {
    return (
      <p className="text-sm text-muted-foreground">
        Este projeto ainda não tem passos de montagem.
      </p>
    );
  }
  const passoEstado = estado.passos[passo.id] ?? { feito: false, checkpoint_confirmado: false };
  const bloqueador = passoEstado.bloqueado_por
    ? guia.find((p) => p.id === passoEstado.bloqueado_por)
    : undefined;
  const proximo = guia[indice + 1];

  return (
    <>
      <section aria-labelledby="titulo-montagem" className="space-y-4">
        <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 id="titulo-montagem" className="text-lg font-semibold">
                Guia de montagem
              </h3>
              <p className="text-sm text-muted-foreground">
                {guia.length} passos, {guia.filter((p) => p.checkpoint).length} com checklist de
                segurança
                {guia.some((p) => p.opcional)
                  ? `, ${guia.filter((p) => p.opcional).length} opcional(is)`
                  : ""}
                .
              </p>
            </div>
            {origem.tipo === "referencia" && (
              <StartButton arquetipoId={data.arquetipo.id} faixa={origem.faixa} />
            )}
          </div>

          {origem.tipo === "projeto" && (
            <>
              <div className="space-y-1">
                <div
                  role="progressbar"
                  aria-label="Progresso do guia"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={estado.percentual}
                  aria-valuetext={`${estado.feitos} de ${estado.obrigatorios} passos feitos`}
                  className="h-2.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-[width]"
                    style={{ width: `${estado.percentual}%` }}
                  />
                </div>
                <p
                  className="flex flex-wrap justify-between gap-2 text-sm"
                  data-testid="progresso-guia"
                >
                  <span>
                    <strong>
                      {estado.feitos} de {estado.obrigatorios}
                    </strong>{" "}
                    passos feitos ({estado.percentual}%)
                  </span>
                  {!estado.concluido && (
                    <span className="text-muted-foreground">
                      Falta: {minutos(estado.tempo_restante_min)} (estimativa)
                    </span>
                  )}
                </p>
              </div>
              {estado.concluido ? (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/40"
                >
                  <PartyPopper aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <p>
                    <strong>Guia concluído!</strong> Continue voando com calma: confira a bateria e
                    as hélices antes de cada voo e reveja a aba Segurança quando for voar em lugar
                    novo.
                  </p>
                </div>
              ) : (
                estado.atual &&
                estado.atual !== passo.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => estado.atual && ir(estado.atual)}
                  >
                    <Hammer aria-hidden="true" className="size-4" /> Continuar de onde parei (passo{" "}
                    {guia.find((p) => p.id === estado.atual)?.numero})
                  </Button>
                )
              )}
            </>
          )}
        </div>

        <GuideStepView
          key={passo.id}
          passo={passo}
          estado={passoEstado}
          total={guia.length}
          bloqueador={bloqueador}
          modo={modo}
          ocupado={ocupado}
          tituloRef={titulo}
          anterior={guia[indice - 1]}
          proximo={proximo}
          onIr={ir}
          onConfirmar={(marcados) => rodar({ tipo: "confirmar", passo_id: passo.id, marcados })}
          onFeito={() =>
            rodar({ tipo: "feito", passo_id: passo.id }, () => proximo && ir(proximo.id))
          }
          onDesfazer={() => rodar({ tipo: "desfazer", passo_id: passo.id })}
        />

        <nav aria-labelledby="titulo-lista-passos" className="space-y-2">
          <h4 id="titulo-lista-passos" className="font-semibold">
            Todos os passos
          </h4>
          <ol className="divide-y rounded-lg border text-sm">
            {guia.map((p) => (
              <StepRow
                key={p.id}
                passo={p}
                feito={estado.passos[p.id]?.feito ?? false}
                atual={p.id === passo.id}
                bloqueado={Boolean(estado.passos[p.id]?.bloqueado_por)}
                onIr={ir}
              />
            ))}
          </ol>
          {origem.tipo === "projeto" && estado.feitos > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {recomecar ? (
                <>
                  <span>Apagar o progresso e recomeçar do passo 1?</span>
                  <Button
                    variant="destructive"
                    size="xs"
                    disabled={ocupado}
                    onClick={() =>
                      rodar({ tipo: "recomecar" }, () => {
                        setRecomecar(false);
                        if (guia[0]) ir(guia[0].id);
                      })
                    }
                  >
                    Sim, recomeçar
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => setRecomecar(false)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="xs" onClick={() => setRecomecar(true)}>
                  <RotateCcw aria-hidden="true" className="size-3" /> Recomeçar o guia
                </Button>
              )}
            </div>
          )}
        </nav>
      </section>

      {data.relatorio.parametros.length > 0 && (
        <section aria-labelledby="titulo-parametros" className="space-y-2">
          <h3 id="titulo-parametros" className="text-lg font-semibold">
            Parâmetros do {data.arquetipo.firmware}
          </h3>
          <p className="text-sm text-muted-foreground">
            Valores do perfil versionado no catálogo (nomes exatamente como no programa de
            configuração). Os calculados dependem das peças deste projeto.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Parâmetros de firmware do projeto</caption>
              <thead className="bg-muted/60 text-xs">
                <tr>
                  <th scope="col" className="p-2">
                    Parâmetro
                  </th>
                  <th scope="col" className="p-2">
                    Valor
                  </th>
                  <th scope="col" className="p-2">
                    Para quê
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.relatorio.parametros.map((p) => (
                  <tr key={p.nome} className="align-top">
                    <th scope="row" className="p-2 font-mono text-xs font-medium">
                      {p.nome}
                    </th>
                    <td className="p-2 font-mono text-xs whitespace-nowrap">
                      {String(p.valor)}
                      {p.unidade ? ` ${p.unidade}` : ""}
                      {p.calculado && (
                        <span className="block font-sans text-[0.7rem] text-muted-foreground">
                          calculado
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{p.explicacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.relatorio.parametros_pendentes.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Sem dado para calcular: {data.relatorio.parametros_pendentes.join(", ")}.
            </p>
          )}
        </section>
      )}
    </>
  );
}

function StepRow({
  passo,
  feito,
  atual,
  bloqueado,
  onIr,
}: {
  passo: GuideStep;
  feito: boolean;
  atual: boolean;
  bloqueado: boolean;
  onIr: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onIr(passo.id)}
        aria-current={atual ? "step" : undefined}
        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent aria-[current=step]:bg-accent aria-[current=step]:font-medium"
      >
        {feito ? (
          <CheckCircle2 aria-label="feito" className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        ) : (
          <Circle aria-label="pendente" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">
          {passo.numero}.
        </span>
        <span className="flex-1">{passo.titulo}</span>
        {passo.checkpoint && (
          <Lock
            aria-label={bloqueado ? "checklist de segurança (bloqueado)" : "checklist de segurança"}
            className="mt-0.5 size-3.5 shrink-0 text-amber-700 dark:text-amber-400"
          />
        )}
        {passo.opcional && <span className="text-xs text-muted-foreground">opcional</span>}
      </button>
    </li>
  );
}

function StartButton({ arquetipoId, faixa }: { arquetipoId: string; faixa: string }) {
  const [pendente, startTransition] = useTransition();
  const ws = useWorkspaceActions();
  return (
    <Button
      size="sm"
      disabled={pendente}
      onClick={() =>
        startTransition(async () => {
          const r = await startFromReferenceAction(arquetipoId, faixa);
          if (r && !r.ok) ws.notificar({ tipo: "erro", texto: r.erro });
        })
      }
    >
      {pendente ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        <Hammer aria-hidden="true" className="size-4" />
      )}
      Começar a montar
    </Button>
  );
}
