import { importedPriceRange } from "@/domain/core/importacao";
import { type CentsRange, priceToCents, sumRanges, ZERO_RANGE } from "@/domain/core/money";

import type { Build, BuildItem } from "./build";
import type { DroneCatalog } from "./catalog";
import { conditionMatches } from "./firmware";
import type { Archetype, Component, Tool } from "./schema";

/*
 * Custos do projeto (SPEC B.6 e B.12): peças, ferramentas, consumíveis e EPI, sempre como faixa
 * em R$ com data (⚠️). Peças com preço só em US$ são convertidas pelo parâmetro de importação.
 * Ferramentas que o usuário já tem saem do total; ferramentas sem preço pesquisado aparecem à
 * parte (o total avisa que não as inclui).
 */

export type CostOrigin = "brl" | "importacao" | "incluido" | "sem_preco";

export type CostLine = {
  id: string;
  nome: string;
  /** Quantos itens vendidos (pacotes) comprar. */
  quantidade: number;
  faixa?: CentsRange;
  origem: CostOrigin;
  /** Produto em cuja caixa a peça já vem (origem "incluido"); com outra origem, a linha é só das
   *  reservas compradas à parte, além das que vêm na caixa. */
  incluido_em?: string;
  /** Parte da faixa que é imposto de importação + ICMS (só em origem "importacao"). */
  tributos?: CentsRange;
  prioridade?: Tool["prioridade"];
  /** Ferramenta, consumível ou EPI (só nas linhas de ferramentas). */
  tipo?: Tool["tipo"];
};

export type ToolKind = Tool["tipo"];
export const TOOL_KINDS: readonly ToolKind[] = ["ferramenta", "consumivel", "epi"];

export type CostReport = {
  pecas: CostLine[];
  ferramentas: CostLine[];
  total_pecas: CentsRange;
  /** Ferramentas, consumíveis e EPI essenciais que o usuário ainda não tem. */
  total_ferramentas: CentsRange;
  /** Os essenciais separados por tipo (SPEC B.12: ferramentas / consumíveis / EPI). */
  totais_por_tipo: Record<ToolKind, CentsRange>;
  /** Ferramentas recomendadas (não entram no total). */
  total_recomendadas: CentsRange;
  /** Quanto do total das peças é imposto de importação + ICMS (já incluído em total_pecas). */
  importacao_estimada: CentsRange;
  total: CentsRange;
  /** Itens sem preço pesquisado: o total não os inclui. */
  sem_preco: string[];
  /** Nomes das ferramentas que o usuário já tem (fora do total). */
  ja_tenho: string[];
  /** As mesmas, com preço e tipo, para a lista mostrar e permitir desmarcar. */
  ferramentas_que_ja_tem: CostLine[];
  /** Algum preço veio de conversão de US$ (mostrar o aviso de importação). */
  usa_importacao: boolean;
  aviso_importacao?: string;
};

function componentLine(
  componente: Component,
  quantidadeCompra: number,
  catalog: DroneCatalog,
  incluidoEm?: string,
): CostLine {
  const nome = `${componente.marca} ${componente.modelo}`;
  if (incluidoEm) {
    return { id: componente.id, nome, quantidade: 0, origem: "incluido", incluido_em: incluidoEm };
  }
  const pacotes = Math.ceil(quantidadeCompra / componente.unidades_por_pacote);
  if (componente.preco_estimado_brl) {
    return {
      id: componente.id,
      nome,
      quantidade: pacotes,
      faixa: priceToCents(componente.preco_estimado_brl, pacotes),
      origem: "brl",
    };
  }
  if (componente.preco_referencia_usd && catalog.importacao) {
    const r = importedPriceRange(componente.preco_referencia_usd, catalog.importacao, pacotes);
    const faixa: CentsRange = {
      min_centavos: r.min_centavos,
      max_centavos: r.max_centavos,
      status: r.status,
      data_mais_antiga: r.data_mais_antiga,
    };
    const tributos: CentsRange = { ...faixa, ...r.tributos };
    return { id: componente.id, nome, quantidade: pacotes, faixa, origem: "importacao", tributos };
  }
  return { id: componente.id, nome, quantidade: pacotes, origem: "sem_preco" };
}

/** Quantas unidades da peça vêm na caixa do produto que a fornece (sem o dado: todas). */
function quantityInBox(build: Build, catalog: DroneCatalog, item: BuildItem): number {
  const dono =
    build.itens.find((i) => i.componente.id === item.fornecido_por)?.componente ??
    catalog.componentes.find((c) => c.id === item.fornecido_por);
  const naCaixa = dono?.inclui.find((inc) => inc.componente_id === item.componente.id);
  return naCaixa?.quantidade ?? item.quantidade_compra;
}

/** Ferramentas usadas pelos passos que valem para este build, mais o EPI essencial. */
export function toolsForBuild(build: Build, archetype: Archetype, catalog: DroneCatalog): Tool[] {
  const ids = new Set<string>();
  for (const passo of archetype.passos) {
    if (!conditionMatches(passo.condicao, build)) continue;
    for (const f of passo.ferramentas) ids.add(f);
  }
  return catalog.ferramentas.filter(
    (t) =>
      (t.arquetipos.length === 0 || t.arquetipos.includes(archetype.id)) &&
      (ids.has(t.id) || (t.tipo === "epi" && t.prioridade === "essencial")),
  );
}

export function computeCosts(
  build: Build,
  archetype: Archetype,
  catalog: DroneCatalog,
  ferramentasQueTenho: ReadonlySet<string> = new Set(),
): CostReport {
  const pecas = build.itens.map((item) => {
    if (!item.fornecido_por) return componentLine(item.componente, item.quantidade_compra, catalog);
    // Reservas além do que vem na caixa (ex.: 8 hélices, o kit traz 6) são compradas à parte.
    const extra = item.quantidade_compra - quantityInBox(build, catalog, item);
    if (extra <= 0) {
      return componentLine(item.componente, item.quantidade_compra, catalog, item.fornecido_por);
    }
    return { ...componentLine(item.componente, extra, catalog), incluido_em: item.fornecido_por };
  });
  const ferramentas: CostLine[] = [];
  const jaTem: CostLine[] = [];
  for (const t of toolsForBuild(build, archetype, catalog)) {
    const linha: CostLine = {
      id: t.id,
      nome: t.nome,
      quantidade: 1,
      faixa: t.preco_estimado_brl ? priceToCents(t.preco_estimado_brl, 1) : undefined,
      origem: t.preco_estimado_brl ? "brl" : "sem_preco",
      prioridade: t.prioridade,
      tipo: t.tipo,
    };
    if (ferramentasQueTenho.has(t.id)) jaTem.push(linha);
    else ferramentas.push(linha);
  }
  const somar = (linhas: CostLine[]) =>
    linhas.length === 0
      ? ZERO_RANGE
      : sumRanges(linhas.flatMap((l) => (l.faixa && l.origem !== "incluido" ? [l.faixa] : [])));
  const essenciais = ferramentas.filter((f) => f.prioridade !== "recomendada");
  const recomendadas = ferramentas.filter((f) => f.prioridade === "recomendada");
  const totalPecas = somar(pecas);
  const totalFerramentas = somar(essenciais);
  const usaImportacao = pecas.some((p) => p.origem === "importacao");
  const tributos = pecas.flatMap((p) => (p.tributos ? [p.tributos] : []));
  const porTipo = Object.fromEntries(
    TOOL_KINDS.map((tipo) => [tipo, somar(essenciais.filter((f) => f.tipo === tipo))]),
  ) as Record<ToolKind, CentsRange>;
  return {
    pecas,
    ferramentas,
    total_pecas: totalPecas,
    total_ferramentas: totalFerramentas,
    totais_por_tipo: porTipo,
    total_recomendadas: somar(recomendadas),
    importacao_estimada: sumRanges(tributos),
    total: sumRanges([totalPecas, totalFerramentas]),
    sem_preco: [...pecas, ...essenciais].filter((l) => l.origem === "sem_preco").map((l) => l.nome),
    ja_tenho: jaTem.map((l) => l.nome),
    ferramentas_que_ja_tem: jaTem,
    usa_importacao: usaImportacao,
    aviso_importacao: usaImportacao ? catalog.importacao?.aviso : undefined,
  };
}
