"use client";

import { AlertTriangle, Check, CircleSlash, Info, Loader2, Plus } from "lucide-react";
import { useState, useTransition } from "react";

import { fmt, fmtDelta, fmtDeltaBRL, formatRange } from "@/components/format";
import { Glossed } from "@/components/glossary/glossary";
import { Seal } from "@/components/seal";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Tier } from "@/domain/categories/drone/build";
import type {
  SlotAlternatives,
  SlotSwap,
  SwapCandidate,
  SwapDelta,
} from "@/domain/categories/drone/swap";
import { swapOnProjectAction, swapOnReferenceAction } from "@/server/actions/projects";

import { useWorkspace } from "./workspace";

/*
 * "Trocar peça" (SPEC B.12): lista só as alternativas que passam nas regras bloqueantes com o resto
 * do projeto, com o que muda (custo, peso, TWR, autonomia, avisos). As que não servem aparecem à
 * parte, com o motivo, e com a troca combinada quando uma troca a mais resolve. Ao escolher, o
 * servidor valida tudo de novo e salva uma versão nova do projeto.
 */

export type SwapOrigin =
  { tipo: "referencia"; arquetipo_id: string; faixa: Tier } | { tipo: "projeto"; id: string };

const TIER_SHORT: Record<Tier, string> = {
  economica: "econômica",
  equilibrada: "equilibrada",
  premium: "premium",
};

export function SwapDialog({
  origem,
  alternativas,
}: {
  origem: SwapOrigin;
  alternativas: SlotAlternatives[];
}) {
  const ws = useWorkspace();
  const [pendente, startTransition] = useTransition();
  const [enviando, setEnviando] = useState<string>();
  const [erro, setErro] = useState<string>();
  const slot = alternativas.find((a) => a.slot === ws.trocaSlot);

  const trocar = (chave: string, trocas: SlotSwap[]) => {
    setErro(undefined);
    setEnviando(chave);
    startTransition(async () => {
      const r =
        origem.tipo === "referencia"
          ? await swapOnReferenceAction(origem.arquetipo_id, origem.faixa, trocas)
          : await swapOnProjectAction(origem.id, trocas);
      // Num build de referência, a ação abre a página do projeto novo (redirecionamento).
      if (!r) return;
      if (!r.ok) {
        setErro(r.erro);
        setEnviando(undefined);
        return;
      }
      setEnviando(undefined);
      ws.fecharTroca();
      ws.notificar({ tipo: "ok", texto: r.mensagem });
    });
  };

  return (
    <Dialog
      open={slot !== undefined}
      onOpenChange={(aberto) => {
        if (!aberto && !pendente) {
          setErro(undefined);
          ws.fecharTroca();
        }
      }}
    >
      {slot && (
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Trocar: {slot.rotulo}</DialogTitle>
            <DialogDescription>
              {slot.atual ? (
                <>
                  Peça atual: <strong className="text-foreground">{slot.atual.nome}</strong>.{" "}
                </>
              ) : null}
              Só aparecem peças do catálogo que passam em todas as regras bloqueantes junto com o
              resto do projeto. Os números já foram recalculados pelo motor de cálculo.
            </DialogDescription>
          </DialogHeader>

          {origem.tipo === "referencia" && (
            <p className="flex gap-2 rounded-md border bg-muted/50 p-3 text-sm">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                Ao trocar, o From Scratch cria <strong>o seu projeto</strong> (uma cópia deste build
                de referência), onde cada troca fica salva com histórico de versões. O build de
                referência continua igual.
              </span>
            </p>
          )}

          {erro && (
            <p
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
            >
              {erro}
            </p>
          )}

          <section aria-label="Alternativas compatíveis" className="space-y-3">
            {slot.compativeis.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Nenhuma outra peça do catálogo serve aqui sozinha.
                {slot.incompativeis.some((c) => c.sugestao)
                  ? " Veja abaixo as trocas combinadas que resolvem."
                  : ""}
              </p>
            ) : (
              <ul className="space-y-3">
                {slot.compativeis.map((c) => (
                  <li key={c.componente_id ?? "remover"}>
                    <CandidateCard candidato={c}>
                      <Button
                        size="sm"
                        disabled={pendente}
                        onClick={() =>
                          trocar(c.componente_id ?? "remover", [
                            { slot: slot.slot, componente_id: c.componente_id },
                          ])
                        }
                      >
                        {enviando === (c.componente_id ?? "remover") ? (
                          <Loader2 aria-hidden="true" className="animate-spin" />
                        ) : (
                          <Check aria-hidden="true" />
                        )}
                        {c.componente_id ? "Usar esta peça" : "Tirar a peça"}
                      </Button>
                    </CandidateCard>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {slot.incompativeis.length > 0 && (
            <details className="rounded-lg border p-3 text-sm" open={slot.compativeis.length === 0}>
              <summary className="cursor-pointer font-semibold">
                Peças do catálogo que não servem aqui ({slot.incompativeis.length})
              </summary>
              <ul className="mt-3 space-y-3">
                {slot.incompativeis.map((c) => (
                  <li key={c.componente_id ?? "remover"} className="rounded-md bg-muted/40 p-3">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <CircleSlash
                        aria-hidden="true"
                        className="size-4 text-red-700 dark:text-red-400"
                      />
                      {c.nome}
                      <Seal status={c.selo} compacto />
                    </p>
                    <p className="mt-1 text-muted-foreground">Não serve porque:</p>
                    <ul className="list-disc pl-5">
                      {c.motivos.map((m) => (
                        <li key={m}>
                          <Glossed text={m} />
                        </li>
                      ))}
                    </ul>
                    {c.sugestao && c.componente_id && (
                      <div className="mt-3 rounded-md border bg-background p-3">
                        <p className="font-medium">
                          Serve se você trocar também:{" "}
                          {c.sugestao.trocas.map((t) => `${t.rotulo} → ${t.nome}`).join("; ")}
                        </p>
                        <DeltaChips delta={c.sugestao.avaliacao.delta} />
                        <Notes
                          incompleto={c.sugestao.avaliacao.sem_dado_novos}
                          novos={c.sugestao.avaliacao.alertas_novos}
                          resolvidos={c.sugestao.avaliacao.alertas_resolvidos}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-2"
                          disabled={pendente}
                          onClick={() =>
                            trocar(`combo-${c.componente_id}`, [
                              { slot: slot.slot, componente_id: c.componente_id },
                              ...(c.sugestao?.trocas ?? []).map((t) => ({
                                slot: t.slot,
                                componente_id: t.componente_id,
                              })),
                            ])
                          }
                        >
                          {enviando === `combo-${c.componente_id}` ? (
                            <Loader2 aria-hidden="true" className="animate-spin" />
                          ) : (
                            <Plus aria-hidden="true" />
                          )}
                          Trocar as {1 + c.sugestao.trocas.length} peças
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </DialogContent>
      )}
    </Dialog>
  );
}

function CandidateCard({
  candidato: c,
  children,
}: {
  candidato: SwapCandidate;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h3 className="flex flex-wrap items-center gap-2 font-semibold">
            {c.nome}
            <Seal status={c.selo} compacto />
            {c.faixas.length > 0 && (
              <span className="rounded-full border px-2 text-xs font-normal text-muted-foreground">
                curador recomenda: {c.faixas.map((f) => TIER_SHORT[f]).join(", ")}
              </span>
            )}
          </h3>
          <p className="text-muted-foreground">
            <Glossed text={c.descricao_leiga} />
          </p>
          <p>
            {c.vem_com
              ? `Vem na caixa de outra peça do projeto.`
              : c.preco
                ? `Preço da peça: ${formatRange(c.preco)}`
                : c.componente_id
                  ? "Sem preço pesquisado"
                  : null}
          </p>
        </div>
        {children}
      </div>
      <DeltaChips delta={c.delta} />
      <Notes
        incompleto={c.sem_dado_novos}
        novos={c.alertas_novos}
        resolvidos={c.alertas_resolvidos}
      />
    </article>
  );
}

function DeltaChips({ delta }: { delta: SwapDelta }) {
  const antesDepois = (a?: number, d?: number, casas = 1, unidade = "") =>
    a === undefined || d === undefined
      ? `${a === undefined ? "sem dado" : fmt(a, casas)} → ${d === undefined ? "sem dado" : fmt(d, casas)}${unidade}`
      : `${fmt(a, casas)} → ${fmt(d, casas)}${unidade}`;
  const chips = [
    { rotulo: "Custo das peças", valor: fmtDeltaBRL(delta.custo_pecas) },
    { rotulo: "Peso", valor: fmtDelta(delta.massa_g, "g") },
    { rotulo: "TWR", valor: antesDepois(delta.twr.antes, delta.twr.depois, 2) },
    {
      rotulo: "Pairar",
      valor: antesDepois(delta.pairar_pct.antes, delta.pairar_pct.depois, 0, "%"),
    },
    {
      rotulo: "Voo (máx.)",
      valor: antesDepois(delta.voo_max_min.antes, delta.voo_max_min.depois, 1, " min"),
    },
  ];
  return (
    <dl className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <div key={c.rotulo} className="rounded-md bg-muted px-2 py-1 text-xs">
          <dt className="inline text-muted-foreground">{c.rotulo}: </dt>
          <dd className="inline font-medium">{c.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

function Notes({
  incompleto,
  novos,
  resolvidos,
}: {
  incompleto: string[];
  novos: string[];
  resolvidos: string[];
}) {
  if (incompleto.length + novos.length + resolvidos.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs">
      {incompleto.map((t) => (
        <li key={`i-${t}`} className="flex gap-1.5 text-slate-700 dark:text-slate-300">
          <span aria-hidden="true">❓</span> Sem dado para confirmar: {t}
        </li>
      ))}
      {novos.map((t) => (
        <li key={`n-${t}`} className="flex gap-1.5 text-amber-900 dark:text-amber-200">
          <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" /> Novo aviso: {t}
        </li>
      ))}
      {resolvidos.map((t) => (
        <li key={`r-${t}`} className="flex gap-1.5 text-emerald-800 dark:text-emerald-300">
          <Check aria-hidden="true" className="size-3.5 shrink-0" /> Some o aviso: {t}
        </li>
      ))}
    </ul>
  );
}
