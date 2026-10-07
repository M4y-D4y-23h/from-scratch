import { BookOpen, Database, Drone, Sparkles } from "lucide-react";
import Link from "next/link";

import { ModeToggle } from "@/components/mode-toggle";

/*
 * Cabeçalho comum: nome do app, atalhos para novo projeto, catálogo e glossário, e o tema. O link
 * "pular para o conteúdo" vem antes de tudo, para quem navega pelo teclado.
 */

type Secao = "inicio" | "novo" | "catalogo" | "glossario" | "projeto";

const NAV = [
  { href: "/novo", rotulo: "Novo projeto", secao: "novo", Icon: Sparkles },
  { href: "/catalogo", rotulo: "Catálogo", secao: "catalogo", Icon: Database },
  { href: "/glossario", rotulo: "Glossário", secao: "glossario", Icon: BookOpen },
] as const;

export function SkipLink() {
  return (
    <a
      href="#conteudo"
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
    >
      Pular para o conteúdo
    </a>
  );
}

export function SiteHeader({ atual, largo = false }: { atual?: Secao; largo?: boolean }) {
  return (
    <>
      <SkipLink />
      <header className="border-b bg-background/95 supports-[backdrop-filter]:bg-background/80 supports-[backdrop-filter]:backdrop-blur">
        <div
          className={`mx-auto flex items-center justify-between gap-4 px-4 py-3 ${largo ? "max-w-[1800px]" : "max-w-6xl"}`}
        >
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold"
            aria-current={atual === "inicio" ? "page" : undefined}
          >
            <Drone aria-hidden="true" className="size-5" />
            <span className="whitespace-nowrap">From Scratch</span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <nav aria-label="Principal">
              <ul className="flex items-center gap-1">
                {NAV.map(({ href, rotulo, secao, Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={atual === secao ? "page" : undefined}
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground"
                    >
                      <Icon aria-hidden="true" className="size-4" />
                      <span className="sr-only sm:not-sr-only">{rotulo}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <ModeToggle />
          </div>
        </div>
      </header>
    </>
  );
}
