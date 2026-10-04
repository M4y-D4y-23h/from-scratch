/*
 * Glossário (SPEC B.1.5 e B.5 GlossaryTerm). A fonte é docs/GLOSSARIO.md; este parser é puro:
 * recebe o texto do arquivo e devolve os termos. Quem lê o arquivo é o servidor.
 */

export type GlossaryTerm = {
  termo: string;
  explicacao: string;
  analogia?: string;
  relacionados: string[];
};

const FIELD = /^- \*\*(Explicação|Analogia|Relacionados):\*\*\s*(.*)$/;

type Draft = { termo: string; campos: Partial<Record<string, string>> };

function finish(draft: Draft, problemas: string[]): GlossaryTerm | undefined {
  const explicacao = draft.campos["Explicação"];
  if (!explicacao) {
    problemas.push(`"${draft.termo}" está sem **Explicação:**`);
    return undefined;
  }
  const relacionados = (draft.campos["Relacionados"] ?? "")
    // Vírgula seguida de número é decimal ("5,8 GHz"), não separador.
    .split(/,(?!\d)/)
    .map((t) => t.trim().replace(/\.$/, ""))
    .filter((t) => t.length > 0);
  return {
    termo: draft.termo,
    explicacao,
    analogia: draft.campos["Analogia"],
    relacionados,
  };
}

/**
 * Lê o Markdown do glossário. Formato: título "## Termo" seguido dos itens
 * "- **Explicação:**", "- **Analogia:**" e "- **Relacionados:**" (linhas seguintes com recuo
 * continuam o item). O que vem antes do primeiro "## " é a introdução e é ignorado.
 */
export function parseGlossary(markdown: string): { termos: GlossaryTerm[]; problemas: string[] } {
  const termos: GlossaryTerm[] = [];
  const problemas: string[] = [];
  let draft: Draft | undefined;
  let campo: string | undefined;

  const flush = () => {
    if (!draft) return;
    const term = finish(draft, problemas);
    if (term) termos.push(term);
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith("## ")) {
      flush();
      draft = { termo: line.slice(3).trim(), campos: {} };
      campo = undefined;
      continue;
    }
    if (!draft) continue;
    const match = FIELD.exec(line);
    if (match?.[1]) {
      campo = match[1];
      draft.campos[campo] = (match[2] ?? "").trim();
      continue;
    }
    if (campo && /^\s+\S/.test(line)) {
      draft.campos[campo] = `${draft.campos[campo] ?? ""} ${line.trim()}`.trim();
      continue;
    }
    if (line === "") campo = undefined;
  }
  flush();

  const vistos = new Set<string>();
  for (const t of termos) {
    const chave = t.termo.toLocaleLowerCase("pt-BR");
    if (vistos.has(chave)) problemas.push(`"${t.termo}" aparece mais de uma vez`);
    vistos.add(chave);
  }
  return { termos, problemas };
}

/** Termos citados em "Relacionados" que ainda não têm verbete próprio. */
export function missingRelatedTerms(termos: readonly GlossaryTerm[]): string[] {
  const existentes = new Set(termos.map((t) => t.termo.toLocaleLowerCase("pt-BR")));
  const faltando = new Set<string>();
  for (const t of termos) {
    for (const r of t.relacionados) {
      if (!existentes.has(r.toLocaleLowerCase("pt-BR"))) faltando.add(r);
    }
  }
  return [...faltando].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
