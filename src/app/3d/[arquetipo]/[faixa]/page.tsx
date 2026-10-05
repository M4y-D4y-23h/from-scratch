import { ArrowLeft, Drone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ModeToggle } from "@/components/mode-toggle";
import { ViewerShell } from "@/components/viewer3d/viewer-shell";
import { TIERS } from "@/domain/categories/drone/solver";
import {
  loadReferenceViewer,
  referenceArchetypes,
  referenceViewerParams,
  TIER_LABEL,
} from "@/server/viewer/reference";

// Só existem as 9 combinações do catálogo (3 arquétipos × 3 faixas): o resto é 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return referenceViewerParams();
}

export async function generateMetadata(
  props: PageProps<"/3d/[arquetipo]/[faixa]">,
): Promise<Metadata> {
  const { arquetipo, faixa } = await props.params;
  const data = loadReferenceViewer(arquetipo, faixa);
  return { title: data ? `3D: ${data.arquetipo.nome} (${TIER_LABEL[data.faixa]})` : "3D" };
}

export default async function ViewerPage(props: PageProps<"/3d/[arquetipo]/[faixa]">) {
  const { arquetipo, faixa } = await props.params;
  const data = loadReferenceViewer(arquetipo, faixa);
  if (!data) notFound();
  const arquetipos = referenceArchetypes();

  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
      >
        Pular para o conteúdo
      </a>
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Drone aria-hidden="true" className="size-5" />
            <span>From Scratch</span>
          </Link>
          <ModeToggle />
        </div>
      </header>

      <main id="conteudo" className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div className="space-y-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeft aria-hidden="true" className="size-4" /> Início
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{data.arquetipo.nome}</h1>
          <p className="max-w-3xl text-muted-foreground">
            Build de referência na faixa {TIER_LABEL[data.faixa].toLowerCase()}, em escala real.{" "}
            {data.arquetipo.para_quem}
          </p>
        </div>

        <nav aria-label="Drones de referência" className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <ul className="flex flex-wrap gap-2">
            {arquetipos.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/3d/${a.id}/${data.faixa}`}
                  aria-current={a.id === data.arquetipo.id ? "page" : undefined}
                  className="inline-block rounded-md border px-3 py-1.5 hover:bg-accent aria-[current=page]:border-primary aria-[current=page]:font-semibold"
                >
                  {a.nome}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap gap-2" aria-label="Faixa de preço">
            {TIERS.map((t) => (
              <li key={t}>
                <Link
                  href={`/3d/${data.arquetipo.id}/${t}`}
                  aria-current={t === data.faixa ? "page" : undefined}
                  className="inline-block rounded-md border px-3 py-1.5 hover:bg-accent aria-[current=page]:border-primary aria-[current=page]:font-semibold"
                >
                  {TIER_LABEL[t]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <ViewerShell data={data} />
      </main>
    </>
  );
}
