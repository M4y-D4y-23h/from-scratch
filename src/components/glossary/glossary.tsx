"use client";

import Link from "next/link";
import { createContext, type ReactNode, useContext, useMemo, useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  compileGlossary,
  type GlossaryMatcher,
  type GlossaryTerm,
  glossarySlug,
  splitGlossary,
} from "@/domain/core/glossary";

/*
 * Glossário clicável em toda a interface (SPEC B.1.5 e B.12): o termo aparece sublinhado e, ao
 * passar o mouse, tocar ou apertar Enter, mostra a explicação e a analogia. Os termos vêm de
 * docs/GLOSSARIO.md (lidos no servidor, no layout raiz).
 */

type GlossaryContextValue = { termos: Map<string, GlossaryTerm>; matcher: GlossaryMatcher };

const GlossaryContext = createContext<GlossaryContextValue | null>(null);

export function GlossaryProvider({
  termos,
  children,
}: {
  termos: GlossaryTerm[];
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ termos: new Map(termos.map((t) => [t.termo, t])), matcher: compileGlossary(termos) }),
    [termos],
  );
  return <GlossaryContext.Provider value={value}>{children}</GlossaryContext.Provider>;
}

/** Texto com os termos do glossário marcados (a primeira vez que cada um aparece). */
export function Glossed({ text }: { text: string }) {
  const ctx = useContext(GlossaryContext);
  if (!ctx) return <>{text}</>;
  const partes = splitGlossary(text, ctx.matcher);
  return (
    <>
      {partes.map((p, i) => {
        const def = p.termo ? ctx.termos.get(p.termo) : undefined;
        return def ? (
          <GlossaryTermPopover key={i} termo={def}>
            {p.texto}
          </GlossaryTermPopover>
        ) : (
          <span key={i}>{p.texto}</span>
        );
      })}
    </>
  );
}

/** Um termo com a explicação num balão. Abre ao passar o mouse, tocar ou com o teclado. */
export function GlossaryTermPopover({
  termo,
  children,
}: {
  termo: GlossaryTerm;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const fixo = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const agendar = (abrir: boolean, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAberto(abrir), ms);
  };
  const entrar = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") agendar(true, 250);
  };
  const sair = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && !fixo.current) agendar(false, 200);
  };

  return (
    <Popover
      open={aberto}
      onOpenChange={(v) => {
        window.clearTimeout(timer.current);
        if (!v) fixo.current = false;
        setAberto(v);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onPointerEnter={entrar}
          onPointerLeave={sair}
          onClick={(e) => {
            // Aberto pelo mouse: o clique fixa o balão em vez de fechar.
            if (aberto && !fixo.current) {
              e.preventDefault();
              fixo.current = true;
            }
          }}
          className="cursor-help rounded-sm underline decoration-current/45 decoration-dotted decoration-[1.5px] underline-offset-[3px] hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        className="w-80 space-y-2 text-sm"
        onPointerEnter={entrar}
        onPointerLeave={sair}
      >
        <p className="font-semibold">{termo.termo}</p>
        <p>{termo.explicacao}</p>
        {termo.analogia && (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Analogia:</span> {termo.analogia}
          </p>
        )}
        <Link
          href={`/glossario#${glossarySlug(termo.termo)}`}
          className="inline-block text-xs font-medium underline underline-offset-2"
        >
          Ver no glossário
        </Link>
      </PopoverContent>
    </Popover>
  );
}
