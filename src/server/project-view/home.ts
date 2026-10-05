import type { Tier } from "@/domain/categories/drone/build";
import { DEFAULT_DRONE_CONFIG } from "@/domain/categories/drone/config";
import { buildProjectReport } from "@/domain/categories/drone/project";
import { solve } from "@/domain/categories/drone/solver";
import type { CentsRange } from "@/domain/core/money";
import type { VerificationStatus } from "@/domain/core/verification";
import type { LoadedCatalog } from "@/server/catalog/load";

/*
 * Cartões dos drones de referência na página inicial: os números principais da faixa econômica
 * (o build mais barato que passa em todas as regras), calculados pelo motor de cálculo.
 */

export type ReferenceCard = {
  id: string;
  nome: string;
  para_quem: string;
  firmware: string;
  faixas: Tier[];
  economica?: {
    massa_g?: number;
    twr?: number;
    voo: { min?: number; max?: number; selo: VerificationStatus };
    total: CentsRange;
    dificuldade: string;
  };
};

export function referenceCards(loaded: LoadedCatalog): ReferenceCard[] {
  const { catalog } = loaded;
  return catalog.arquetipos.map((a) => {
    const faixas = solve({ archetype: a, catalog, config: DEFAULT_DRONE_CONFIG }).faixas;
    const eco = faixas.find((f) => f.faixa === "economica");
    const report = eco
      ? buildProjectReport(eco.build, a, catalog, DEFAULT_DRONE_CONFIG)
      : undefined;
    return {
      id: a.id,
      nome: a.nome,
      para_quem: a.para_quem,
      firmware: a.firmware,
      faixas: faixas.map((f) => f.faixa),
      economica: report && {
        massa_g: report.metricas.auw.massa_total_g,
        twr: report.metricas.propulsion.twr,
        voo: {
          min: report.metricas.flight.min_minutos,
          max: report.metricas.flight.max_minutos,
          selo: report.metricas.flight.selo,
        },
        total: report.custos.total,
        dificuldade: report.dificuldade.rotulo,
      },
    };
  });
}
