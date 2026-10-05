import { fmt, fmtHours } from "@/components/format";
import { Glossed } from "@/components/glossary/glossary";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DIFFICULTY_LABELS, type DifficultyLevel, LEVEL_LABEL } from "@/domain/core/difficulty";
import type { ProjectViewData } from "@/server/project-view/view";

import { HighlightButton } from "../workspace-buttons";

/*
 * Aba "Dificuldade" (SPEC B.8): nível de 0 a 5 por domínio, derivado dos passos de montagem (não
 * é opinião do LLM). Clicar num domínio mostra o que se aprende, os riscos e os passos que o usam.
 */

const LABEL_STYLE: Record<string, string> = {
  Iniciante: "bg-emerald-100 text-emerald-950 dark:bg-emerald-900/60 dark:text-emerald-50",
  Intermediário: "bg-sky-100 text-sky-950 dark:bg-sky-900/60 dark:text-sky-50",
  Avançado: "bg-amber-100 text-amber-950 dark:bg-amber-900/60 dark:text-amber-50",
  Especialista: "bg-red-100 text-red-950 dark:bg-red-900/60 dark:text-red-50",
};

function LevelBar({ nivel }: { nivel: DifficultyLevel }) {
  return (
    <span aria-hidden="true" className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`h-2.5 w-5 rounded-sm ${
            n <= nivel
              ? nivel >= 4
                ? "bg-red-500"
                : nivel === 3
                  ? "bg-amber-500"
                  : "bg-sky-500"
              : "bg-muted"
          }`}
        />
      ))}
    </span>
  );
}

export function DifficultyTab({ data }: { data: ProjectViewData }) {
  const d = data.relatorio.dificuldade;
  return (
    <>
      <section aria-labelledby="titulo-dificuldade" className="space-y-3">
        <h3 id="titulo-dificuldade" className="text-lg font-semibold">
          Dificuldade geral
        </h3>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2 rounded-lg border p-4">
          <p>
            <span
              className={`rounded-full px-3 py-1 text-base font-semibold ${LABEL_STYLE[d.rotulo] ?? "bg-muted"}`}
            >
              {d.rotulo}
            </span>
          </p>
          <p className="text-sm">
            Nota <strong>{fmt(d.nota, 2)}</strong> de 5
          </p>
          <p className="text-sm">
            <strong>{fmtHours(d.horas_totais)}</strong> no total, entre aprender e fazer ⚠️
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Conta: {d.formula}. Rótulos, do mais fácil ao mais difícil: {DIFFICULTY_LABELS.join(", ")}
          . As horas de aprendizado são uma estimativa para quem nunca fez (⚠️).
        </p>
      </section>

      <section aria-labelledby="titulo-dominios" className="space-y-2">
        <h3 id="titulo-dominios" className="text-lg font-semibold">
          Por área de conhecimento
        </h3>
        <p className="text-sm text-muted-foreground">
          Níveis: 0 nenhum conhecimento · 1 seguir instruções com imagens · 2 usar ferramentas com
          cuidado · 3 diagnosticar problemas · 4 adaptar · 5 projetar do zero. Clique numa área.
        </p>
        <Accordion type="single" collapsible className="rounded-lg border px-3">
          {d.dominios.map((dom) => (
            <AccordionItem key={dom.dominio} value={dom.dominio}>
              <AccordionTrigger className="items-center hover:no-underline">
                <span className="flex flex-1 flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{dom.rotulo}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <LevelBar nivel={dom.nivel} />
                    <span>nível {dom.nivel} de 5</span>
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                <p>
                  <strong>Nível {dom.nivel}:</strong> {LEVEL_LABEL[dom.nivel]}.
                </p>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-muted p-2">
                    <dt className="text-muted-foreground">Para aprender (leigo)</dt>
                    <dd className="font-medium">{fmtHours(dom.horas_aprendizado)} ⚠️</dd>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <dt className="text-muted-foreground">Nos passos do guia</dt>
                    <dd className="font-medium">{fmtHours(dom.horas_passos)}</dd>
                  </div>
                </dl>
                <div>
                  <p className="font-medium">O que você vai aprender</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                    {dom.passos.map((p) => (
                      <li key={p.id}>
                        <span className="text-foreground">{p.titulo}</span> (nível {p.nivel}):{" "}
                        <Glossed text={p.objetivo} />
                      </li>
                    ))}
                  </ul>
                </div>
                {dom.riscos.length > 0 && (
                  <div>
                    <p className="font-medium">Principais riscos</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                      {dom.riscos.map((r) => (
                        <li key={r}>
                          <Glossed text={r} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <HighlightButton
                  rotulo={`Peças da área: ${dom.rotulo}`}
                  categorias={[
                    ...new Set(
                      data.relatorio.passos
                        .filter((p) => dom.passos.some((x) => x.id === p.id))
                        .flatMap((p) => p.pecas),
                    ),
                  ]}
                >
                  Destacar as peças desta área no 3D
                </HighlightButton>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </>
  );
}
