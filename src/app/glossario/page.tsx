import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";
import { glossarySlug } from "@/domain/core/glossary";
import { loadGlossary } from "@/server/glossary/load";

/*
 * Glossário (SPEC B.1.5): todos os termos técnicos com explicação simples e analogia. Os balões
 * da interface apontam para cá. Fonte: docs/GLOSSARIO.md.
 */

export const metadata: Metadata = { title: "Glossário" };

export default function GlossaryPage() {
  const termos = [...loadGlossary().termos].sort((a, b) =>
    a.termo.localeCompare(b.termo, "pt-BR", { sensitivity: "base" }),
  );
  const existentes = new Set(termos.map((t) => t.termo));
  const letras = [...new Set(termos.map((t) => glossarySlug(t.termo).charAt(0).toUpperCase()))];
  return (
    <>
      <SiteHeader atual="glossario" />
      <main id="conteudo" className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Glossário</h1>
          <p className="text-muted-foreground">
            {termos.length} termos técnicos explicados de um jeito simples, com uma analogia do dia
            a dia. Na interface, eles aparecem sublinhados: passe o mouse ou toque para ver a
            explicação.
          </p>
          <nav aria-label="Letras">
            <ul className="flex flex-wrap gap-1 text-sm">
              {letras.map((l) => (
                <li key={l}>
                  <a
                    href={`#letra-${l}`}
                    className="inline-block min-w-7 rounded border px-1.5 py-0.5 text-center hover:bg-accent"
                  >
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <dl className="space-y-4">
          {termos.map((t, i) => {
            const letra = glossarySlug(t.termo).charAt(0).toUpperCase();
            const anterior =
              i > 0
                ? glossarySlug(termos[i - 1]!.termo)
                    .charAt(0)
                    .toUpperCase()
                : "";
            return (
              <div
                key={t.termo}
                id={glossarySlug(t.termo)}
                className="scroll-mt-4 rounded-lg border p-4 target:border-primary target:ring-2 target:ring-ring/40"
              >
                {letra !== anterior && <span id={`letra-${letra}`} className="block scroll-mt-4" />}
                <dt className="text-lg font-semibold">{t.termo}</dt>
                <dd className="mt-1">{t.explicacao}</dd>
                {t.analogia && (
                  <dd className="mt-2 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Analogia:</span> {t.analogia}
                  </dd>
                )}
                {t.relacionados.length > 0 && (
                  <dd className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    <span className="text-muted-foreground">Veja também:</span>
                    {t.relacionados.map((r) =>
                      existentes.has(r) ? (
                        <a
                          key={r}
                          href={`#${glossarySlug(r)}`}
                          className="rounded-full border px-2 py-0.5 hover:bg-accent"
                        >
                          {r}
                        </a>
                      ) : (
                        <span key={r} className="rounded-full border px-2 py-0.5">
                          {r}
                        </span>
                      ),
                    )}
                  </dd>
                )}
              </div>
            );
          })}
        </dl>
      </main>
    </>
  );
}
