"use client";

import Link from "next/link";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
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
 *
 * Desempenho: há UM balão por página, que se posiciona no termo apontado ou clicado (âncora
 * virtual do Radix). Antes cada termo montava o seu próprio balão (mais de 100 na aba Montagem).
 */

type Ativo = {
  termo: GlossaryTerm;
  alvo: HTMLElement;
  /** Aberto por clique, toque ou teclado (fica aberto); pelo mouse passando, fecha ao sair. */
  fixo: boolean;
};

type GlossaryContextValue = {
  termos: Map<string, GlossaryTerm>;
  matcher: GlossaryMatcher;
  /** Mouse entrou no termo: abre depois de um instante. */
  apontar: (termo: string, alvo: HTMLElement) => void;
  /** Mouse saiu do termo: fecha depois de um instante (se não foi fixado). */
  desapontar: () => void;
  /** Clique, toque ou teclado: abre fixo (ou fixa o que o mouse abriu; ou fecha se já fixo). */
  clicar: (termo: string, alvo: HTMLElement) => void;
};

const GlossaryContext = createContext<GlossaryContextValue | null>(null);

const ABRIR_MS = 250;
const FECHAR_MS = 200;

export function GlossaryProvider({
  termos,
  children,
}: {
  termos: GlossaryTerm[];
  children: ReactNode;
}) {
  const base = useMemo(
    () => ({ termos: new Map(termos.map((t) => [t.termo, t])), matcher: compileGlossary(termos) }),
    [termos],
  );
  const [ativo, setAtivo] = useState<Ativo>();
  const ativoRef = useRef<Ativo | undefined>(undefined);
  const ancora = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  /** Ao fechar: o balão estava fixo? Foi fechado por um clique fora? (decide para onde vai o foco) */
  const fechamento = useRef({ fixo: false, fora: false });
  const idBalao = useId();

  const mostrar = useCallback((novo: Ativo | undefined) => {
    if (!novo) fechamento.current.fixo = ativoRef.current?.fixo ?? false;
    ativoRef.current = novo;
    if (novo) ancora.current = novo.alvo;
    setAtivo(novo);
  }, []);
  const agendar = useCallback((fazer: () => void, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fazer, ms);
  }, []);
  const cancelar = useCallback(() => window.clearTimeout(timer.current), []);

  const apontar = useCallback(
    (nome: string, alvo: HTMLElement) => {
      const termo = base.termos.get(nome);
      if (!termo) return;
      if (ativoRef.current?.fixo) return;
      agendar(() => mostrar({ termo, alvo, fixo: false }), ABRIR_MS);
    },
    [agendar, base.termos, mostrar],
  );
  const desapontar = useCallback(() => {
    if (ativoRef.current?.fixo) return;
    agendar(() => mostrar(undefined), FECHAR_MS);
  }, [agendar, mostrar]);
  const clicar = useCallback(
    (nome: string, alvo: HTMLElement) => {
      const termo = base.termos.get(nome);
      if (!termo) return;
      cancelar();
      const atual = ativoRef.current;
      if (atual?.alvo === alvo && atual.fixo) mostrar(undefined);
      else mostrar({ termo, alvo, fixo: true });
    },
    [base.termos, cancelar, mostrar],
  );

  // aria-expanded/aria-controls no termo aberto (direto no elemento: nenhum termo é redesenhado).
  useEffect(() => {
    const alvo = ativo?.alvo;
    if (!alvo) return;
    alvo.setAttribute("aria-expanded", "true");
    alvo.setAttribute("aria-controls", idBalao);
    return () => {
      alvo.setAttribute("aria-expanded", "false");
      alvo.removeAttribute("aria-controls");
    };
  }, [ativo, idBalao]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const value = useMemo(
    () => ({ ...base, apontar, desapontar, clicar }),
    [base, apontar, desapontar, clicar],
  );
  const termo = ativo?.termo;

  return (
    <GlossaryContext.Provider value={value}>
      {children}
      <Popover
        open={Boolean(ativo)}
        onOpenChange={(aberto) => {
          if (!aberto) mostrar(undefined);
        }}
      >
        <PopoverAnchor virtualRef={ancora} />
        {termo && (
          <PopoverContent
            id={idBalao}
            side="top"
            className="w-80 space-y-2 text-sm"
            onPointerEnter={cancelar}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") desapontar();
            }}
            // Aberto pelo mouse passando: não rouba o foco de quem está lendo.
            onOpenAutoFocus={(e) => {
              if (!ativoRef.current?.fixo) e.preventDefault();
            }}
            // Fechado com Esc depois de aberto por clique ou teclado: o foco volta para o termo
            // (quem usa teclado continua de onde estava). Mouse passando ou clique fora: não.
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              const { fixo, fora } = fechamento.current;
              if (fixo && !fora) ancora.current?.focus({ preventScroll: true });
              fechamento.current = { fixo: false, fora: false };
            }}
            // Clicar no próprio termo não conta como "clicar fora": o clique dele decide.
            onInteractOutside={(e) => {
              if (ativoRef.current?.alvo.contains(e.target as Node)) e.preventDefault();
              else fechamento.current.fora = true;
            }}
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
        )}
      </Popover>
    </GlossaryContext.Provider>
  );
}

/** Texto com os termos do glossário marcados (a primeira vez que cada um aparece). */
export function Glossed({ text }: { text: string }) {
  const ctx = useContext(GlossaryContext);
  if (!ctx) return <>{text}</>;
  const partes = splitGlossary(text, ctx.matcher);
  return (
    <>
      {partes.map((p, i) =>
        p.termo && ctx.termos.has(p.termo) ? (
          <GlossaryTermButton key={i} termo={p.termo} ctx={ctx}>
            {p.texto}
          </GlossaryTermButton>
        ) : (
          <span key={i}>{p.texto}</span>
        ),
      )}
    </>
  );
}

/** O termo sublinhado: um botão simples; o balão é o do GlossaryProvider. */
function GlossaryTermButton({
  termo,
  ctx,
  children,
}: {
  termo: string;
  ctx: GlossaryContextValue;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded="false"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") ctx.apontar(termo, e.currentTarget);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") ctx.desapontar();
      }}
      onClick={(e) => ctx.clicar(termo, e.currentTarget)}
      className="cursor-help rounded-sm underline decoration-current/45 decoration-dotted decoration-[1.5px] underline-offset-[3px] hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
    >
      {children}
    </button>
  );
}
