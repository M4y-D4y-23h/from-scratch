import { importedPriceRange } from "@/domain/core/importacao";
import { type CentsRange, priceToCents, sumRanges, ZERO_RANGE } from "@/domain/core/money";

import type { Build } from "./build";
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
  /** Produto em cuja caixa a peça já vem (origem "incluido"). */
  incluido_em?: string;
  prioridade?: Tool["prioridade"];
};

export type CostReport = {
  pecas: CostLine[];
  ferramentas: CostLine[];
  total_pecas: CentsRange;
  /** Ferramentas, consumíveis e EPI essenciais que o usuário ainda não tem. */
  total_ferramentas: CentsRange;
  /** Ferramentas recomendadas (não entram no total). */
  total_recomendadas: CentsRange;
  total: CentsRange;
  /** Itens sem preço pesquisado: o total não os inclui. */
  sem_preco: string[];
  ja_tenho: string[];
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
    return { id: componente.id, nome, quantidade: pacotes, faixa, origem: "importacao" };
  }
  return { id: componente.id, nome, quantidade: pacotes, origem: "sem_preco" };
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
  const pecas = build.itens.map((item) =>
    componentLine(item.componente, item.quantidade_compra, catalog, item.fornecido_por),
  );
  const ferramentas: CostLine[] = [];
  const jaTenho: string[] = [];
  for (const t of toolsForBuild(build, archetype, catalog)) {
    if (ferramentasQueTenho.has(t.id)) {
      jaTenho.push(t.nome);
      continue;
    }
    ferramentas.push({
      id: t.id,
      nome: t.nome,
      quantidade: 1,
      faixa: t.preco_estimado_brl ? priceToCents(t.preco_estimado_brl, 1) : undefined,
      origem: t.preco_estimado_brl ? "brl" : "sem_preco",
      prioridade: t.prioridade,
    });
  }
  const somar = (linhas: CostLine[]) =>
    sumRanges(linhas.flatMap((l) => (l.faixa && l.origem !== "incluido" ? [l.faixa] : [])));
  const essenciais = ferramentas.filter((f) => f.prioridade !== "recomendada");
  const recomendadas = ferramentas.filter((f) => f.prioridade === "recomendada");
  const totalPecas = pecas.length > 0 ? somar(pecas) : ZERO_RANGE;
  const totalFerramentas = essenciais.length > 0 ? somar(essenciais) : ZERO_RANGE;
  const usaImportacao = pecas.some((p) => p.origem === "importacao");
  return {
    pecas,
    ferramentas,
    total_pecas: totalPecas,
    total_ferramentas: totalFerramentas,
    total_recomendadas: recomendadas.length > 0 ? somar(recomendadas) : ZERO_RANGE,
    total: sumRanges([totalPecas, totalFerramentas]),
    sem_preco: [...pecas, ...essenciais].filter((l) => l.origem === "sem_preco").map((l) => l.nome),
    ja_tenho: jaTenho,
    usa_importacao: usaImportacao,
    aviso_importacao: usaImportacao ? catalog.importacao?.aviso : undefined,
  };
}
