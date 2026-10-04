import type { SafetyAlert } from "@/domain/core/safety";
import type { ValidationReport } from "@/domain/core/validation";

import type { Build } from "./build";
import type { DroneCatalog } from "./catalog";
import { type BuildMetrics, validateBuild } from "./compatibility";
import type { DroneConfig } from "./config";
import { computeCosts, type CostReport } from "./costs";
import { computeDifficulty, type DifficultyReport } from "./difficulty";
import { conditionMatches, type ResolvedParam, resolveFirmwareParams } from "./firmware";
import { computeLocations, type LocationGroup } from "./locations";
import { projectAlerts } from "./safety";
import type { Archetype, BuildStepTemplate } from "./schema";

/*
 * O projeto completo de um build (SPEC B.12): o que os painéis mostram. Tudo determinístico e
 * calculado a partir do catálogo; o LLM (Fase 4) só reescreve as explicações.
 */

export type ProjectReport = {
  build: Build;
  validacao: ValidationReport;
  metricas: BuildMetrics;
  custos: CostReport;
  dificuldade: DifficultyReport;
  locais: LocationGroup[];
  alertas: SafetyAlert[];
  parametros: ResolvedParam[];
  /** Parâmetros que dependem de dado que falta (ex.: capacidade da bateria). */
  parametros_pendentes: string[];
  passos: BuildStepTemplate[];
};

export function buildProjectReport(
  build: Build,
  archetype: Archetype,
  catalog: DroneCatalog,
  config: DroneConfig,
  ferramentasQueTenho: ReadonlySet<string> = new Set(),
): ProjectReport {
  const profile = catalog.perfis_firmware.find((p) => p.id === archetype.perfil_firmware);
  const { report, metrics } = validateBuild({
    build,
    archetype,
    thrustTables: catalog.empuxo,
    config,
    firmwareProfile: profile,
  });
  const params = profile ? resolveFirmwareParams(profile, build) : { parametros: [], faltando: [] };
  return {
    build,
    validacao: report,
    metricas: metrics,
    custos: computeCosts(build, archetype, catalog, ferramentasQueTenho),
    dificuldade: computeDifficulty(build, archetype, config),
    locais: computeLocations(build, archetype, catalog),
    alertas: projectAlerts(build, archetype, metrics),
    parametros: params.parametros,
    parametros_pendentes: params.faltando,
    passos: archetype.passos.filter((p) => conditionMatches(p.condicao, build)),
  };
}
