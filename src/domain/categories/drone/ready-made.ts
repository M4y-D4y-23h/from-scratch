import { importedPriceRange } from "@/domain/core/importacao";
import { type CentsRange, priceToCents, sumRanges } from "@/domain/core/money";
import type { Source } from "@/domain/core/source";

import type { Build } from "./build";
import type { DroneCatalog } from "./catalog";
import type { CostReport } from "./costs";
import type { Archetype, ReadyMade } from "./schema";
import { SRC } from "./sources";

/*
 * Montar × comprar pronto (decisão 8 do dono do projeto). Para cada drone pronto de referência
 * do arquétipo, soma o preço dele com o que ainda falta comprar (as peças do projeto cujas
 * categorias ele não traz: rádio, óculos, baterias...) e compara com o custo das peças do
 * projeto. Tudo em faixas ⚠️ com data, pelo mesmo método de importação das peças.
 */

export type ReadyMadeVerdict =
  "pronto_mais_barato" | "montar_mais_barato" | "parecido" | "sem_preco";

export type ReadyMadeOption = {
  id: string;
  nome: string;
  tipo: ReadyMade["tipo"];
  preco?: CentsRange;
  /** Peças do projeto que o pronto não traz e que você compraria do mesmo jeito. */
  complementos: Array<{ id: string; nome: string; faixa?: CentsRange }>;
  /** Preço do pronto + complementos com preço. */
  total?: CentsRange;
  veredito: ReadyMadeVerdict;
  baterias: { pronto?: number; projeto: number };
  massa_g?: number;
  tempo_voo_fabricante_min?: number;
  diferencas: string[];
  fontes: Source[];
};

export type ReadyMadeComparison = {
  /** Nota fixa de honestidade: pronto pode sair mais barato. */
  aviso: string;
  fonte: Source;
  /** Custo das peças do projeto (para comparar). */
  montar_pecas: CentsRange;
  /** Ferramentas e EPI que montar exige e o pronto não (o "já tenho" já foi descontado). */
  montar_ferramentas: CentsRange;
  opcoes: ReadyMadeOption[];
};

export const AVISO_PRONTO =
  "Um drone pronto pode sair mais barato que montar. O ganho de montar é aprender como tudo funciona, saber consertar sozinho e escolher cada peça. A documentação do ArduPilot diz o mesmo: com tantos drones prontos baratos, há pouca vantagem de custo em montar, principalmente nos drones menores.";

function priceOf(r: ReadyMade, catalog: DroneCatalog): CentsRange | undefined {
  if (r.preco_estimado_brl) return priceToCents(r.preco_estimado_brl);
  if (r.preco_referencia_usd && catalog.importacao) {
    const { min_centavos, max_centavos, status, data_mais_antiga } = importedPriceRange(
      r.preco_referencia_usd,
      catalog.importacao,
    );
    return { min_centavos, max_centavos, status, data_mais_antiga };
  }
  return undefined;
}

function verdict(total: CentsRange | undefined, montar: CentsRange): ReadyMadeVerdict {
  if (!total) return "sem_preco";
  if (total.max_centavos < montar.min_centavos) return "pronto_mais_barato";
  if (montar.max_centavos < total.min_centavos) return "montar_mais_barato";
  return "parecido";
}

export function compareReadyMade(
  build: Build,
  custos: CostReport,
  archetype: Archetype,
  catalog: DroneCatalog,
): ReadyMadeComparison {
  const categoriaDe = new Map(build.itens.map((i) => [i.componente.id, i.componente.categoria]));
  const bateria = build.itens.find((i) => i.componente.categoria === "bateria");
  const opcoes = catalog.prontos
    .filter((r) => r.arquetipo_id === archetype.id)
    .map((r): ReadyMadeOption => {
      const cobre = new Set(r.cobre_categorias);
      const complementos = custos.pecas
        .filter((l) => l.origem !== "incluido")
        .filter((l) => {
          const cat = categoriaDe.get(l.id);
          return cat !== undefined && !cobre.has(cat);
        })
        .map((l) => ({ id: l.id, nome: l.nome, faixa: l.faixa }));
      const preco = priceOf(r, catalog);
      const total = preco
        ? sumRanges([preco, ...complementos.flatMap((c) => (c.faixa ? [c.faixa] : []))])
        : undefined;
      return {
        id: r.id,
        nome: `${r.marca} ${r.modelo}`,
        tipo: r.tipo,
        preco,
        complementos,
        total,
        veredito: verdict(total, custos.total_pecas),
        baterias: { pronto: r.baterias_inclusas, projeto: bateria?.quantidade_compra ?? 0 },
        massa_g: r.massa_g,
        tempo_voo_fabricante_min: r.tempo_voo_fabricante_min,
        diferencas: r.diferencas,
        fontes: r.fontes,
      };
    });
  return {
    aviso: AVISO_PRONTO,
    fonte: SRC.ardupilotChoosingFrame,
    montar_pecas: custos.total_pecas,
    montar_ferramentas: custos.total_ferramentas,
    opcoes,
  };
}
