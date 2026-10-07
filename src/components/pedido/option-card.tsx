"use client";

import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, XCircle } from "lucide-react";

import { fmt, fmtMinutes, formatRange, unpricedNote } from "@/components/format";
import { Glossed } from "@/components/glossary/glossary";
import { Seal } from "@/components/seal";
import { Button } from "@/components/ui/button";
import type { BudgetFit, OptionCard } from "@/domain/categories/drone/pipeline/plan";

/*
 * Cartão de uma opção (econômica, equilibrada, premium) do pedido. Todos os números vêm do motor
 * de cálculo e do catálogo; o cartão só formata.
 */

const ORCAMENTO: Record<BudgetFit, { texto: string; estilo: string }> = {
  cabe: {
    texto: "Cabe no seu orçamento",
    estilo:
      "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100",
  },
  pode_caber: {
    texto: "Pode caber, com os preços mais baixos",
    estilo:
      "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100",
  },
  acima: {
    texto: "Acima do seu orçamento",
    estilo:
      "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100",
  },
};

const REGRAS: Record<OptionCard["regras"], { texto: string; Icon: typeof CheckCircle2 }> = {
  compativel: { texto: "Peças compatíveis (todas as regras passaram)", Icon: CheckCircle2 },
  incompleto: { texto: "Faltam dados para confirmar algumas regras", Icon: CircleHelp },
  bloqueado: { texto: "Alguma regra bloqueante falhou", Icon: XCircle },
};

export function PedidoOptionCard({
  opcao,
  mostrarArquetipo = false,
  criando,
  desabilitado,
  onEscolher,
}: {
  opcao: OptionCard;
  mostrarArquetipo?: boolean;
  criando: boolean;
  desabilitado: boolean;
  onEscolher: () => void;
}) {
  const regras = REGRAS[opcao.regras];
  const semPreco = unpricedNote(opcao.sem_preco);
  const titulo = mostrarArquetipo
    ? `${opcao.arquetipo_nome} (${opcao.rotulo.toLowerCase()})`
    : opcao.rotulo;
  return (
    <article
      aria-label={titulo}
      className="flex h-full flex-col gap-3 rounded-xl border bg-card p-4 text-sm shadow-xs"
      data-testid={`opcao-${opcao.arquetipo_id}-${opcao.faixa}`}
    >
      <header className="space-y-1">
        <h3 className="text-lg leading-tight font-semibold">{titulo}</h3>
        {opcao.orcamento && (
          <p
            className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${ORCAMENTO[opcao.orcamento].estilo}`}
          >
            {ORCAMENTO[opcao.orcamento].texto}
          </p>
        )}
      </header>

      <div>
        <p className="text-xs text-muted-foreground">Total com ferramentas</p>
        <p className="flex flex-wrap items-center gap-1.5 text-base font-semibold">
          {formatRange(opcao.total)}
          <Seal status={opcao.total.status} compacto />
        </p>
        <p className="text-xs text-muted-foreground">
          Só as peças: {formatRange(opcao.total_pecas)}
          {semPreco ? ` · ${semPreco}` : ""}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Peso</dt>
        <dd className="text-right">
          {opcao.massa_g !== undefined ? `${fmt(opcao.massa_g, 0)} g` : "sem dado"}
        </dd>
        <dt className="text-muted-foreground">
          <Glossed text="TWR" />
        </dt>
        <dd className="text-right">{opcao.twr !== undefined ? fmt(opcao.twr, 1) : "sem dado"}</dd>
        <dt className="text-muted-foreground">Voo por bateria</dt>
        <dd className="flex items-center justify-end gap-1">
          {fmtMinutes(opcao.voo.min, opcao.voo.max)}
          <Seal status="estimativa" compacto />
        </dd>
        <dt className="text-muted-foreground">Dificuldade</dt>
        <dd className="text-right">{opcao.dificuldade.rotulo}</dd>
      </dl>

      <p className="flex items-start gap-1.5 text-xs">
        <regras.Icon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        {regras.texto}
      </p>

      {opcao.avisos.length > 0 && (
        <ul className="space-y-1 text-xs">
          {opcao.avisos.map((a) => (
            <li key={a} className="flex items-start gap-1.5">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0 text-amber-600"
              />
              {a}
            </li>
          ))}
        </ul>
      )}

      <Button
        className="mt-auto w-full"
        onClick={onEscolher}
        disabled={desabilitado || opcao.regras === "bloqueado"}
      >
        {criando ? (
          <>
            <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Criando o projeto...
          </>
        ) : (
          "Escolher esta opção"
        )}
      </Button>
    </article>
  );
}
