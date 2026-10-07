import { type Tier, TIER_LABEL } from "@/domain/categories/drone/build";
import { toolsForBuild } from "@/domain/categories/drone/costs";
import { importedPriceRange } from "@/domain/core/importacao";
import { formatRange, priceToCents } from "@/domain/core/money";
import type { VerificationStatus } from "@/domain/core/verification";
import { memo } from "@/server/cache/memo";
import { solveCached } from "@/server/engine/solve";

import type { LoadedCatalog } from "./load";
import type { CatalogKind } from "./write";

/*
 * Visão geral do catálogo para a página /catalogo: uma linha por item, com selo, preço (com a
 * data), massa e em quais builds de referência ele entra, para o dono saber o que conferir primeiro.
 */

export type CatalogRow = {
  tipo: CatalogKind;
  id: string;
  nome: string;
  categoria: string;
  selo?: VerificationStatus;
  /** Preço como aparece na lista ("R$ 10,00 a R$ 20,00" ou "US$ 40,00 → R$ ..."). */
  preco?: string;
  preco_data?: string;
  massa_g?: number;
  fontes: number;
  /** Builds de referência que usam o item (ex.: "A1 econômica"). */
  usado_em: string[];
  /** Arquétipos (ids) que usam o item, para filtrar. */
  arquetipos: string[];
};

export type CatalogOverview = {
  componentes: CatalogRow[];
  empuxo: CatalogRow[];
  ferramentas: CatalogRow[];
  prontos: CatalogRow[];
  arquetipos: Array<{ id: string; rotulo: string; nome: string }>;
};

const USD = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

export function catalogOverview(loaded: LoadedCatalog): CatalogOverview {
  return memo(`catalogo|${loaded.hash}`, () => computeOverview(loaded));
}

function computeOverview(loaded: LoadedCatalog): CatalogOverview {
  const { catalog } = loaded;
  const arquetipos = catalog.arquetipos.map((a, i) => ({
    id: a.id,
    rotulo: `A${i + 1}`,
    nome: a.nome,
  }));
  const rotuloDe = new Map(arquetipos.map((a) => [a.id, a.rotulo]));

  // Quem usa o quê nos 9 builds de referência.
  const usoPeca = new Map<string, Set<string>>();
  const usoTabela = new Map<string, Set<string>>();
  const usoFerramenta = new Map<string, Set<string>>();
  const arqPeca = new Map<string, Set<string>>();
  const arqTabela = new Map<string, Set<string>>();
  const arqFerramenta = new Map<string, Set<string>>();
  const marcar = (m: Map<string, Set<string>>, id: string, valor: string) => {
    m.set(id, (m.get(id) ?? new Set()).add(valor));
  };
  for (const a of catalog.arquetipos) {
    for (const plano of solveCached(loaded, a).faixas) {
      const uso = `${rotuloDe.get(a.id)} ${TIER_LABEL[plano.faixa as Tier].toLowerCase()}`;
      for (const item of plano.build.itens) {
        marcar(usoPeca, item.componente.id, uso);
        marcar(arqPeca, item.componente.id, a.id);
      }
      const tabela = plano.metricas.propulsion.tabela_id;
      if (tabela) {
        marcar(usoTabela, tabela, uso);
        marcar(arqTabela, tabela, a.id);
      }
      for (const t of toolsForBuild(plano.build, a, catalog)) {
        marcar(usoFerramenta, t.id, uso);
        marcar(arqFerramenta, t.id, a.id);
      }
    }
  }
  const lista = (s: Set<string> | undefined) => [...(s ?? [])];

  const precoUsd = (usd: { min: number; max: number; data: string }) => {
    const valor =
      usd.min === usd.max ? USD.format(usd.min) : `${USD.format(usd.min)} a ${USD.format(usd.max)}`;
    if (!catalog.importacao) return valor;
    return `${valor} → ${formatRange(importedPriceRange(usd, catalog.importacao))}`;
  };

  return {
    arquetipos,
    componentes: catalog.componentes.map((c) => ({
      tipo: "componente",
      id: c.id,
      nome: `${c.marca} ${c.modelo}`,
      categoria: c.categoria,
      selo: c.status_verificacao,
      preco: c.preco_estimado_brl
        ? formatRange(priceToCents(c.preco_estimado_brl))
        : c.preco_referencia_usd
          ? precoUsd(c.preco_referencia_usd)
          : c.vendido_separadamente
            ? undefined
            : "vem dentro de outro produto",
      preco_data: c.preco_estimado_brl?.data ?? c.preco_referencia_usd?.data,
      massa_g: c.massa_g ?? c.massa_estimada_g?.valor,
      fontes: c.fontes.length,
      usado_em: lista(usoPeca.get(c.id)),
      arquetipos: lista(arqPeca.get(c.id)),
    })),
    empuxo: catalog.empuxo.map((t) => {
      const motor = catalog.componentes.find((c) => c.id === t.motor_id);
      const helice = catalog.componentes.find((c) => c.id === t.helice_id);
      return {
        tipo: "empuxo",
        id: t.id,
        nome: `${motor ? `${motor.marca} ${motor.modelo}` : t.motor_id} + ${helice ? helice.modelo : t.helice_id} (${t.celulas}S)`,
        categoria: "tabela de empuxo",
        selo: t.status_verificacao,
        fontes: t.fontes.length,
        usado_em: lista(usoTabela.get(t.id)),
        arquetipos: lista(arqTabela.get(t.id)),
      };
    }),
    ferramentas: catalog.ferramentas.map((t) => ({
      tipo: "ferramenta",
      id: t.id,
      nome: t.nome,
      categoria: `${t.tipo} · ${t.prioridade}`,
      selo: t.preco_estimado_brl?.status,
      preco: t.preco_estimado_brl ? formatRange(priceToCents(t.preco_estimado_brl)) : undefined,
      preco_data: t.preco_estimado_brl?.data,
      fontes: t.fontes.length,
      usado_em: lista(usoFerramenta.get(t.id)),
      arquetipos: lista(arqFerramenta.get(t.id)),
    })),
    prontos: catalog.prontos.map((r) => ({
      tipo: "pronto",
      id: r.id,
      nome: `${r.marca} ${r.modelo}`,
      categoria: `pronto ${r.tipo}`,
      selo: r.status_verificacao,
      preco: r.preco_estimado_brl
        ? formatRange(priceToCents(r.preco_estimado_brl))
        : r.preco_referencia_usd
          ? precoUsd(r.preco_referencia_usd)
          : undefined,
      preco_data: r.preco_estimado_brl?.data ?? r.preco_referencia_usd?.data,
      massa_g: r.massa_g,
      fontes: r.fontes.length,
      usado_em: [`${rotuloDe.get(r.arquetipo_id) ?? r.arquetipo_id} (comparação montar × pronto)`],
      arquetipos: [r.arquetipo_id],
    })),
  };
}
