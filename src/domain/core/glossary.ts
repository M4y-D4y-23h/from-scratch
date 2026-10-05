/*
 * Glossário (SPEC B.1.5 e B.5 GlossaryTerm). A fonte é docs/GLOSSARIO.md; este parser é puro:
 * recebe o texto do arquivo e devolve os termos. Quem lê o arquivo é o servidor.
 */

export type GlossaryTerm = {
  termo: string;
  explicacao: string;
  analogia?: string;
  relacionados: string[];
  /**
   * Palavras que, logo depois do termo, mostram que o texto fala de outra coisa: "receptor USB" é
   * o receptor de vídeo, não o do rádio. Nesses casos o termo não é sublinhado.
   */
  nao_sublinhar_antes_de?: string[];
};

const FIELD = /^- \*\*(Explicação|Analogia|Relacionados|Não sublinhar antes de):\*\*\s*(.*)$/;

/** Lista separada por vírgula. Vírgula seguida de número é decimal ("5,8 GHz"), não separador. */
function commaList(texto: string | undefined): string[] {
  return (texto ?? "")
    .split(/,(?!\d)/)
    .map((t) => t.trim().replace(/\.$/, ""))
    .filter((t) => t.length > 0);
}

type Draft = { termo: string; campos: Partial<Record<string, string>> };

function finish(draft: Draft, problemas: string[]): GlossaryTerm | undefined {
  const explicacao = draft.campos["Explicação"];
  if (!explicacao) {
    problemas.push(`"${draft.termo}" está sem **Explicação:**`);
    return undefined;
  }
  const excecoes = commaList(draft.campos["Não sublinhar antes de"]);
  return {
    termo: draft.termo,
    explicacao,
    analogia: draft.campos["Analogia"],
    relacionados: commaList(draft.campos["Relacionados"]),
    ...(excecoes.length > 0 && { nao_sublinhar_antes_de: excecoes }),
  };
}

/**
 * Lê o Markdown do glossário. Formato: título "## Termo" seguido dos itens
 * "- **Explicação:**", "- **Analogia:**", "- **Relacionados:**" e, se precisar,
 * "- **Não sublinhar antes de:**" (linhas seguintes com recuo continuam o item). O que vem antes
 * do primeiro "## " é a introdução e é ignorado.
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

// ---------------------------------------------------------------------------
// Termos no texto da interface (SPEC B.12: "termos técnicos sublinhados em toda a UI")
// ---------------------------------------------------------------------------

/** Pedaço de texto: comum, ou um termo do glossário (com o nome do verbete). */
export type GlossarySegment = { texto: string; termo?: string };

export type GlossaryMatcher = { regex: RegExp; termos: string[] };

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "é" → "[éÉ]": comparação sem diferenciar maiúsculas, inclusive com acento. */
function caseless(texto: string): string {
  return [...texto]
    .map((ch) => {
      const lo = ch.toLocaleLowerCase("pt-BR");
      const up = ch.toLocaleUpperCase("pt-BR");
      return lo === up ? escapeRegex(ch) : `[${lo}${up}]`;
    })
    .join("");
}

/** Palavras de ligação não vão para o plural: "receptores de vídeo". */
const LIGACAO = new Set(["de", "do", "da", "e"]);

/** Sigla (ESC) ou nome com maiúscula no meio (LiPo, GHz): plural só com "s". */
function pluralOf(palavra: string): string {
  if (!/\p{L}$/u.test(palavra) || LIGACAO.has(palavra.toLocaleLowerCase("pt-BR"))) return "";
  const letras = palavra.replace(/[^\p{L}]/gu, "");
  const soS = letras === letras.toLocaleUpperCase("pt-BR") || /\p{Lu}/u.test(letras.slice(1));
  return soS ? "s?" : "(?:es|s)?";
}

/**
 * Padrão de um termo:
 * - sigla toda em maiúsculas (ESC, TWR, GPS): exatamente assim, com plural "s" (ESCs, UARTs);
 * - nome com maiúscula no meio (LiPo, ArduPilot, Câmera FPV): a primeira letra em qualquer caixa,
 *   o resto exato;
 * - palavra comum (Hélice, Célula, Frame): sem diferenciar maiúsculas.
 * Cada palavra aceita o plural (em português ele vai na primeira: "receptores de vídeo", "câmeras
 * FPV"), menos as de ligação. Espaços do termo aceitam qualquer espaço no texto.
 */
function termPattern(termo: string): string {
  const letras = termo.replace(/[^\p{L}]/gu, "");
  const sigla = letras.length > 0 && letras === letras.toLocaleUpperCase("pt-BR");
  const misto = !sigla && /\p{Lu}/u.test(termo.slice(1));
  return termo
    .split(/\s+/)
    .map((p, i) => {
      const corpo = sigla
        ? escapeRegex(p)
        : misto
          ? i === 0
            ? caseless(p.charAt(0)) + escapeRegex(p.slice(1))
            : escapeRegex(p)
          : caseless(p);
      return corpo + pluralOf(p);
    })
    .join("\\s+");
}

/** "receptor USB", "receptor (USB ou óculos)": o termo seguido de uma das exceções não conta. */
function exceptionsPattern(excecoes: readonly string[] | undefined): string {
  if (!excecoes || excecoes.length === 0) return "";
  const alternativas = excecoes.map((e) => e.split(/\s+/).map(caseless).join("\\s+")).join("|");
  return `(?![\\s(]+(?:${alternativas})(?![\\p{L}\\p{N}]))`;
}

/** Compila os termos uma vez (o mais longo primeiro: "Câmera FPV" antes de "FPV"). */
export function compileGlossary(
  termos: readonly Pick<GlossaryTerm, "termo" | "nao_sublinhar_antes_de">[],
): GlossaryMatcher {
  const lista = [...termos].sort((a, b) => b.termo.length - a.termo.length);
  const grupos = lista
    .map((t) => `(${termPattern(t.termo)}${exceptionsPattern(t.nao_sublinhar_antes_de)})`)
    .join("|");
  // Fronteira de palavra que entende acentos: nem letra nem número colado antes ou depois.
  const regex = new RegExp(`(?<![\\p{L}\\p{N}])(?:${grupos})(?![\\p{L}\\p{N}])`, "gu");
  return { regex, termos: lista.map((t) => t.termo) };
}

/**
 * Divide o texto em pedaços, marcando a primeira ocorrência de cada termo (sublinhar toda vez
 * cansaria a leitura). `jaMarcados` permite continuar a contagem entre trechos do mesmo bloco.
 */
export function splitGlossary(
  texto: string,
  matcher: GlossaryMatcher,
  jaMarcados: Set<string> = new Set(),
): GlossarySegment[] {
  if (matcher.termos.length === 0 || texto.length === 0) return [{ texto }];
  const out: GlossarySegment[] = [];
  let ultimo = 0;
  const regex = new RegExp(matcher.regex.source, matcher.regex.flags);
  for (let m = regex.exec(texto); m !== null; m = regex.exec(texto)) {
    const indice = m.slice(1).findIndex((g) => g !== undefined);
    const termo = matcher.termos[indice];
    if (!termo || jaMarcados.has(termo)) continue;
    jaMarcados.add(termo);
    if (m.index > ultimo) out.push({ texto: texto.slice(ultimo, m.index) });
    out.push({ texto: m[0], termo });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) out.push({ texto: texto.slice(ultimo) });
  return out;
}

/** Âncora do termo na página do glossário: "Câmera FPV" → "camera-fpv". */
export function glossarySlug(termo: string): string {
  return termo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
