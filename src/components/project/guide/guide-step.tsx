"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  Loader2,
  Lock,
  MessagesSquare,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { type RefObject, useState } from "react";

import { fmt } from "@/components/format";
import { Glossed } from "@/components/glossary/glossary";
import { SafetyAlertCard } from "@/components/safety-alerts";
import { Button } from "@/components/ui/button";
import type { GuideStep, StepState } from "@/domain/categories/drone/guide";
import { DOMAIN_LABEL, LEVEL_LABEL, type DifficultyLevel } from "@/domain/core/difficulty";
import { LOCATION_LABEL } from "@/domain/core/location";

import { HighlightButton } from "../workspace-buttons";

/*
 * Um passo do guia (SPEC B.13): objetivo, por que importa, peças, ferramentas, tempo,
 * dificuldade, riscos, checklist de segurança, como saber que deu certo, erros comuns, destaque
 * no 3D e o botão do tutor. Os dados vêm do catálogo e do projeto; a tela só mostra.
 */

export const minutos = ([a, b]: readonly [number, number]) => {
  const f = (m: number) => (m >= 60 ? `${fmt(m / 60)} h` : `${m} min`);
  return a === b ? f(a) : `${f(a)} a ${f(b)}`;
};

function List({
  titulo,
  itens,
  muted = false,
}: {
  titulo: string;
  itens: string[];
  muted?: boolean;
}) {
  if (itens.length === 0) return null;
  return (
    <div>
      <h4 className="font-medium">{titulo}</h4>
      <ul className={`mt-1 list-disc space-y-0.5 pl-5 ${muted ? "text-muted-foreground" : ""}`}>
        {itens.map((x) => (
          <li key={x}>
            <Glossed text={x} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export type StepMode =
  /** Projeto salvo, versão atual: dá para marcar. */
  | { tipo: "editavel" }
  /** Build de referência ou versão antiga: só leitura, com o motivo. */
  | { tipo: "leitura"; motivo: string };

export function GuideStepView({
  passo,
  estado,
  total,
  bloqueador,
  modo,
  ocupado,
  tituloRef,
  onConfirmar,
  onFeito,
  onDesfazer,
  onIr,
  anterior,
  proximo,
}: {
  passo: GuideStep;
  estado: StepState;
  total: number;
  /** Passo crítico pendente que impede marcar este. */
  bloqueador?: GuideStep;
  modo: StepMode;
  ocupado: boolean;
  tituloRef: RefObject<HTMLHeadingElement | null>;
  onConfirmar: (marcados: string[]) => void;
  onFeito: () => void;
  onDesfazer: () => void;
  onIr: (id: string) => void;
  anterior?: GuideStep;
  proximo?: GuideStep;
}) {
  const [marcados, setMarcados] = useState<string[]>([]);
  const editavel = modo.tipo === "editavel";
  const checklist = passo.checkpoint;
  const precisaConfirmar = Boolean(checklist) && !estado.checkpoint_confirmado && !estado.feito;
  const todosMarcados = checklist ? checklist.itens.every((i) => marcados.includes(i)) : true;
  const local = LOCATION_LABEL[passo.local];

  return (
    <article
      aria-labelledby={`titulo-passo-${passo.id}`}
      className="space-y-4 rounded-xl border p-4 text-sm"
      data-testid="passo-atual"
    >
      <header className="space-y-2">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Passo {passo.numero} de {total}
          </span>
          <span>
            <span aria-hidden="true">{local.simbolo}</span> {local.rotulo}
          </span>
          <span className="flex items-center gap-1">
            <Clock aria-hidden="true" className="size-3" />
            {minutos(passo.tempo_min)}
          </span>
          {passo.opcional && <span className="rounded-full border px-2">opcional</span>}
        </p>
        <h3
          id={`titulo-passo-${passo.id}`}
          ref={tituloRef}
          tabIndex={-1}
          className="flex items-start gap-2 text-lg leading-snug font-semibold outline-none"
        >
          {estado.feito ? (
            <CheckCircle2 aria-hidden="true" className="mt-1 size-5 shrink-0 text-emerald-600" />
          ) : (
            <Circle aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" />
          )}
          <span>
            {passo.titulo}
            <span className="sr-only">{estado.feito ? " (feito)" : " (pendente)"}</span>
          </span>
        </h3>
      </header>

      {bloqueador && !estado.feito && (
        <div
          role="note"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40"
        >
          <Lock aria-hidden="true" className="size-4 shrink-0" />
          <p className="flex-1">
            Para marcar este passo, termine antes o passo {bloqueador.numero} ({bloqueador.titulo}
            ): ele tem um checklist de segurança. Dá para ler à vontade.
          </p>
          <Button variant="outline" size="xs" onClick={() => onIr(bloqueador.id)}>
            Ir para o passo {bloqueador.numero}
          </Button>
        </div>
      )}

      {checklist && (
        <section
          aria-labelledby={`checklist-${passo.id}`}
          className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-950/30"
        >
          <h4 id={`checklist-${passo.id}`} className="flex items-center gap-2 font-semibold">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Checklist de segurança: confirme antes de começar
          </h4>
          {estado.checkpoint_confirmado || estado.feito ? (
            <>
              <ul className="list-disc space-y-0.5 pl-5">
                {checklist.itens.map((item) => (
                  <li key={item}>
                    <Glossed text={item} />
                  </li>
                ))}
              </ul>
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 aria-hidden="true" className="size-3.5" />
                Checklist confirmado. Se algo mudar, desfaça o passo e confira tudo de novo.
              </p>
            </>
          ) : (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (todosMarcados) onConfirmar(marcados);
              }}
            >
              <fieldset
                className="space-y-1.5"
                disabled={!editavel || ocupado || Boolean(bloqueador)}
              >
                <legend className="sr-only">Itens do checklist</legend>
                {checklist.itens.map((item) => (
                  <label key={item} className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                      checked={marcados.includes(item)}
                      onChange={(e) =>
                        setMarcados((atual) =>
                          e.target.checked ? [...atual, item] : atual.filter((x) => x !== item),
                        )
                      }
                    />
                    <span>
                      <Glossed text={item} />
                    </span>
                  </label>
                ))}
              </fieldset>
              {editavel && (
                <Button
                  type="submit"
                  size="sm"
                  disabled={!todosMarcados || ocupado || Boolean(bloqueador)}
                >
                  <ShieldCheck aria-hidden="true" className="size-4" />
                  {todosMarcados
                    ? "Confirmar o checklist"
                    : `Marque os ${checklist.itens.length} itens para confirmar`}
                </Button>
              )}
            </form>
          )}
        </section>
      )}

      <p>
        <span className="font-medium">Objetivo:</span> <Glossed text={passo.objetivo} />
      </p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Por que importa:</span>{" "}
        <Glossed text={passo.por_que_importa} />
      </p>

      {passo.pecas_do_build.length > 0 && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-medium">Peças deste passo</h4>
            <HighlightButton rotulo={`Passo: ${passo.titulo}`} categorias={passo.pecas}>
              Ver no 3D
            </HighlightButton>
          </div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {passo.pecas_do_build.map((p) => (
              <li key={p.id}>
                {p.quantidade > 1 ? `${p.quantidade} × ` : ""}
                {p.nome}
              </li>
            ))}
          </ul>
        </div>
      )}

      {passo.ferramentas_do_passo.length > 0 && (
        <div>
          <h4 className="font-medium">Ferramentas</h4>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {passo.ferramentas_do_passo.map((t) => (
              <li key={t.id}>
                <Glossed text={t.nome} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {passo.parametros_do_passo.length > 0 && (
        <div>
          <h4 className="font-medium">Parâmetros do firmware neste passo</h4>
          <ul className="mt-1 space-y-1">
            {passo.parametros_do_passo.map((p) => (
              <li key={p.nome}>
                <code className="font-mono text-xs font-medium">{p.nome}</code> ={" "}
                <code className="font-mono text-xs">
                  {p.valor === undefined
                    ? "sem dado no catálogo"
                    : `${p.valor}${p.unidade ? ` ${p.unidade}` : ""}`}
                </code>
                {p.explicacao && (
                  <span className="block text-xs text-muted-foreground">{p.explicacao}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <List titulo="Como saber que deu certo" itens={passo.como_saber_que_deu_certo} />
      <List titulo="Erros comuns" itens={passo.erros_comuns} muted />
      <List titulo="Riscos" itens={passo.riscos} muted />

      {passo.alertas_do_passo.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium">Alertas deste passo</h4>
          <ul className="space-y-2">
            {passo.alertas_do_passo.map((a) => (
              <li key={a.id}>
                <SafetyAlertCard alerta={a} comNivel />
              </li>
            ))}
          </ul>
        </div>
      )}

      {Object.keys(passo.dominios).length > 0 && (
        <p className="text-xs text-muted-foreground">
          Exige:{" "}
          {Object.entries(passo.dominios)
            .map(
              ([d, n]) =>
                `${DOMAIN_LABEL[d as keyof typeof DOMAIN_LABEL]} (nível ${n}: ${LEVEL_LABEL[n as DifficultyLevel].toLowerCase()})`,
            )
            .join("; ")}
        </p>
      )}

      {passo.fontes.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {passo.fontes.map((f) => (
            <li key={`${f.titulo}-${f.url ?? ""}`}>
              Fonte:{" "}
              {f.url ? (
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2"
                >
                  {f.titulo}
                  <ExternalLink aria-hidden="true" className="size-3" />
                </a>
              ) : (
                f.titulo
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <MessagesSquare aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          <Button variant="outline" size="xs" disabled className="mb-1">
            Perguntar ao tutor sobre este passo
          </Button>
          <span className="block">
            O tutor por chat, que conhece este projeto e olha fotos, chega na Fase 6.
          </span>
        </span>
      </p>

      {modo.tipo === "leitura" && (
        <p className="rounded-lg bg-muted/50 p-3 text-xs">{modo.motivo}</p>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => anterior && onIr(anterior.id)}
          disabled={!anterior}
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Anterior
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {editavel &&
            (estado.feito ? (
              <Button variant="outline" size="sm" onClick={onDesfazer} disabled={ocupado}>
                <RotateCcw aria-hidden="true" className="size-4" /> Desfazer
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={onFeito}
                disabled={ocupado || precisaConfirmar || Boolean(bloqueador)}
              >
                {ocupado ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                )}
                {proximo ? "Feito, ir para o próximo" : "Feito"}
              </Button>
            ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => proximo && onIr(proximo.id)}
            disabled={!proximo}
          >
            Próximo <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </footer>
      {editavel && precisaConfirmar && !bloqueador && (
        <p className="text-right text-xs text-muted-foreground">
          Confirme o checklist de segurança para marcar como feito.
        </p>
      )}
    </article>
  );
}
