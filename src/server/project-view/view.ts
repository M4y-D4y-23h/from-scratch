import {
  type BomGroupRows,
  bomRows,
  groupBom,
  type PurchaseOption,
  purchaseOptions,
} from "@/domain/categories/drone/bom";
import type { Build, Tier } from "@/domain/categories/drone/build";
import type { DroneCatalog } from "@/domain/categories/drone/catalog";
import { type DroneConfig, DEFAULT_DRONE_CONFIG } from "@/domain/categories/drone/config";
import { type CostLine, toolsForBuild } from "@/domain/categories/drone/costs";
import { computeDifficulty } from "@/domain/categories/drone/difficulty";
import { conditionMatches } from "@/domain/categories/drone/firmware";
import { buildProjectReport, type ProjectReport } from "@/domain/categories/drone/project";
import {
  buildDroneScene,
  type ScenePartInfo,
  scenePartsInfo,
} from "@/domain/categories/drone/scene";
import type { Archetype, Component, Tool } from "@/domain/categories/drone/schema";
import { compareSizeClasses, type SizeComparison } from "@/domain/categories/drone/size-comparison";
import { solve, type TierPlan } from "@/domain/categories/drone/solver";
import {
  allSlotAlternatives,
  type BuildChoice,
  choiceFromBuild,
  materializeChoice,
  type SlotAlternatives,
} from "@/domain/categories/drone/swap";
import type { ValidationReport } from "@/domain/core/validation";
import { deriveStatus, type VerificationStatus } from "@/domain/core/verification";
import type { LoadedCatalog } from "@/server/catalog/load";
import type { VersionSnapshot } from "@/server/projects/repository";

/*
 * Tudo o que a página de um projeto mostra (SPEC B.12), calculado no servidor a partir do
 * catálogo e do motor de cálculo. O resultado é JSON puro: vai inteiro para a página, que só
 * formata. Nenhum número nasce aqui.
 */

export const TIER_LABEL: Record<Tier, string> = {
  economica: "Econômica",
  equilibrada: "Equilibrada",
  premium: "Premium",
};

export type ProjectStatusKind = "compativel" | "incompleto" | "bloqueado";

export type ProjectStatus = {
  tipo: ProjectStatusKind;
  titulo: string;
  texto: string;
  /** Selo do conjunto de regras (o mais fraco das regras bloqueantes). */
  selo: VerificationStatus;
};

export type ToolView = {
  id: string;
  nome: string;
  tipo: Tool["tipo"];
  prioridade: Tool["prioridade"];
  para_que_serve: string;
  por_que_necessaria: string;
  alternativa_barata?: string;
  cuidados: string[];
  custo: CostLine;
  ja_tenho: boolean;
  onde_comprar: PurchaseOption[];
  /** Títulos dos passos do guia que usam a ferramenta. */
  passos: string[];
};

export type ProjectOrigin =
  | { tipo: "referencia"; arquetipo_id: string; faixa: Tier }
  | {
      tipo: "projeto";
      id: string;
      titulo: string;
      /** Versão mostrada. */
      versao: number;
      versao_atual: number;
      versoes: Array<{ numero: number; motivo: string; criado_em: string }>;
      /** O catálogo mudou desde que a versão foi salva: os números usam o catálogo atual. */
      catalogo_mudou: boolean;
      /** Peças que saíram do catálogo (a cópia guardada na versão foi usada). */
      pecas_fora_do_catalogo: string[];
      faixa_origem?: Tier;
    };

export type ProjectViewData = {
  origem: ProjectOrigin;
  arquetipo: Pick<
    Archetype,
    "id" | "nome" | "descricao" | "para_quem" | "firmware" | "estilo_voo" | "massa_max_g" | "faixas"
  >;
  status: ProjectStatus;
  build: Build;
  relatorio: Omit<ProjectReport, "build">;
  bom: BomGroupRows[];
  ferramentas: ToolView[];
  alternativas: SlotAlternatives[];
  /** Painel de cada peça que aparece no 3D. */
  partes: Record<string, ScenePartInfo>;
  /** Comparação 450 mm × 5" (Arquétipo 1, SPEC B.2.1). */
  comparacao_tamanho?: SizeComparison;
  catalogo_hash: string;
};

export type ViewDeps = {
  loaded: LoadedCatalog;
  config?: DroneConfig;
  ferramentasQueTenho?: ReadonlySet<string>;
};

export function projectStatus(validacao: ValidationReport): ProjectStatus {
  const bloqueantes = validacao.resultados.filter((r) => r.severidade === "bloqueante");
  const selo = deriveStatus(
    bloqueantes.map((r) => r.selo),
    "comparacao",
  );
  const falharam = bloqueantes.filter((r) => r.status === "falhou");
  if (falharam.length > 0) {
    return {
      tipo: "bloqueado",
      titulo: "Não monte assim",
      texto: `${falharam.length} regra(s) bloqueante(s) falharam: ${falharam.map((r) => r.titulo).join("; ")}. Veja a aba Cálculos.`,
      selo,
    };
  }
  const semDado = bloqueantes.filter((r) => r.status === "sem_dado");
  if (semDado.length > 0) {
    return {
      tipo: "incompleto",
      titulo: "Faltam dados para confirmar",
      texto: `Nenhuma regra bloqueante falhou, mas ${semDado.length} ficaram sem dado: ${semDado.map((r) => r.titulo).join("; ")}. O app não pode afirmar que é seguro.`,
      selo,
    };
  }
  const alertas = validacao.resultados.filter(
    (r) => r.severidade === "alerta" && r.status === "falhou",
  );
  return {
    tipo: "compativel",
    titulo: "Peças compatíveis",
    texto:
      `Todas as ${bloqueantes.length} regras bloqueantes passaram` +
      (alertas.length > 0 ? `, com ${alertas.length} aviso(s) para ler.` : ".") +
      (selo === "nao_verificado"
        ? " Os dados do catálogo ainda não foram conferidos (❓): confira antes de comprar."
        : ""),
    selo,
  };
}

function archetypeOf(catalog: DroneCatalog, id: string): Archetype | undefined {
  return catalog.arquetipos.find((a) => a.id === id);
}

/** Plano da faixa no formato que a comparação de tamanho usa. */
function asPlan(faixa: Tier, report: ProjectReport): TierPlan {
  return {
    faixa,
    build: report.build,
    validacao: report.validacao,
    metricas: report.metricas,
    custos: report.custos,
    escolhas: [],
    validas: 1,
  };
}

function sizeComparison(
  archetype: Archetype,
  faixa: Tier,
  report: ProjectReport,
  catalog: DroneCatalog,
  config: DroneConfig,
): SizeComparison | undefined {
  if (archetype.firmware !== "ArduPilot") return undefined;
  const fpv = catalog.arquetipos.find((a) => a.firmware === "Betaflight" && a.id.includes("5pol"));
  if (!fpv) return undefined;
  const plano5 = solve({ archetype: fpv, catalog, config }).faixas[0];
  if (!plano5) return undefined;
  return compareSizeClasses(
    archetype,
    [
      {
        rotulo: "Classe 450 mm (este projeto)",
        plano: asPlan(faixa, report),
        dificuldade: report.dificuldade,
      },
      {
        rotulo: 'Classe 5" (FPV de referência)',
        plano: plano5,
        dificuldade: computeDifficulty(plano5.build, fpv, config),
      },
    ],
    catalog,
    config,
  );
}

function toolViews(
  build: Build,
  archetype: Archetype,
  catalog: DroneCatalog,
  report: ProjectReport,
): ToolView[] {
  const linhas = new Map(
    [...report.custos.ferramentas, ...report.custos.ferramentas_que_ja_tem].map((l) => [l.id, l]),
  );
  const jaTem = new Set(report.custos.ferramentas_que_ja_tem.map((l) => l.id));
  const passos = archetype.passos.filter((p) => conditionMatches(p.condicao, build));
  return toolsForBuild(build, archetype, catalog).flatMap((t) => {
    const custo = linhas.get(t.id);
    if (!custo) return [];
    return [
      {
        id: t.id,
        nome: t.nome,
        tipo: t.tipo,
        prioridade: t.prioridade,
        para_que_serve: t.para_que_serve,
        por_que_necessaria: t.por_que_necessaria,
        alternativa_barata: t.alternativa_barata,
        cuidados: t.cuidados,
        custo,
        ja_tenho: jaTem.has(t.id),
        onde_comprar: purchaseOptions(t.onde_comprar),
        passos: passos.filter((p) => p.ferramentas.includes(t.id)).map((p) => p.titulo),
      },
    ];
  });
}

/** Monta a página a partir de um build já resolvido. */
function assemble(
  origem: ProjectOrigin,
  archetype: Archetype,
  build: Build,
  choice: BuildChoice,
  faixa: Tier,
  deps: ViewDeps,
): ProjectViewData {
  const { catalog, hash } = deps.loaded;
  const config = deps.config ?? DEFAULT_DRONE_CONFIG;
  const owned = deps.ferramentasQueTenho ?? new Set<string>();
  const report = buildProjectReport(build, archetype, catalog, config, owned);
  const relatorio: Omit<ProjectReport, "build"> = {
    validacao: report.validacao,
    metricas: report.metricas,
    custos: report.custos,
    dificuldade: report.dificuldade,
    locais: report.locais,
    alertas: report.alertas,
    parametros: report.parametros,
    parametros_pendentes: report.parametros_pendentes,
    passos: report.passos,
    prontos: report.prontos,
  };
  return {
    origem,
    arquetipo: {
      id: archetype.id,
      nome: archetype.nome,
      descricao: archetype.descricao,
      para_quem: archetype.para_quem,
      firmware: archetype.firmware,
      estilo_voo: archetype.estilo_voo,
      massa_max_g: archetype.massa_max_g,
      faixas: archetype.faixas,
    },
    status: projectStatus(report.validacao),
    build,
    relatorio,
    bom: groupBom(bomRows(build, archetype, report.custos)),
    ferramentas: toolViews(build, archetype, catalog, report),
    alternativas: allSlotAlternatives({
      choice,
      archetype,
      catalog,
      config,
      ferramentasQueTenho: owned,
      atual: report,
    }),
    partes: scenePartsInfo(build, report.custos),
    comparacao_tamanho: sizeComparison(archetype, faixa, report, catalog, config),
    catalogo_hash: hash,
  };
}

/** O build de referência (solver) de um arquétipo numa faixa. */
export function referenceBuild(
  loaded: LoadedCatalog,
  arquetipoId: string,
  faixa: Tier,
  config: DroneConfig = DEFAULT_DRONE_CONFIG,
): { archetype: Archetype; build: Build } | undefined {
  const archetype = archetypeOf(loaded.catalog, arquetipoId);
  if (!archetype) return undefined;
  const plano = solve({ archetype, catalog: loaded.catalog, config }).faixas.find(
    (p) => p.faixa === faixa,
  );
  return plano ? { archetype, build: plano.build } : undefined;
}

export function referenceProjectView(
  arquetipoId: string,
  faixa: Tier,
  deps: ViewDeps,
): ProjectViewData | undefined {
  const ref = referenceBuild(deps.loaded, arquetipoId, faixa, deps.config);
  if (!ref) return undefined;
  return assemble(
    { tipo: "referencia", arquetipo_id: arquetipoId, faixa },
    ref.archetype,
    ref.build,
    choiceFromBuild(ref.build, faixa),
    faixa,
    deps,
  );
}

export type SavedProjectInput = {
  id: string;
  titulo: string;
  versao: number;
  versao_atual: number;
  versoes: Array<{ numero: number; motivo: string; criado_em: Date }>;
  catalogo_hash: string;
  escolha: BuildChoice;
  pecas: Component[];
};

export function savedProjectView(
  projeto: SavedProjectInput,
  deps: ViewDeps,
): ProjectViewData | { erro: string } {
  const { catalog, hash } = deps.loaded;
  const archetype = archetypeOf(catalog, projeto.escolha.arquetipo_id);
  if (!archetype) {
    return { erro: `O arquétipo "${projeto.escolha.arquetipo_id}" não existe mais no catálogo.` };
  }
  const montado = materializeChoice(projeto.escolha, archetype, catalog, projeto.pecas);
  if (!montado.build) return { erro: montado.descartado };
  const nomes = new Map(projeto.pecas.map((c) => [c.id, `${c.marca} ${c.modelo}`]));
  return assemble(
    {
      tipo: "projeto",
      id: projeto.id,
      titulo: projeto.titulo,
      versao: projeto.versao,
      versao_atual: projeto.versao_atual,
      versoes: projeto.versoes.map((v) => ({
        numero: v.numero,
        motivo: v.motivo,
        criado_em: v.criado_em.toISOString(),
      })),
      catalogo_mudou: projeto.catalogo_hash !== hash,
      pecas_fora_do_catalogo: montado.faltando.map((id) => nomes.get(id) ?? id),
      faixa_origem: projeto.escolha.faixa_origem,
    },
    archetype,
    montado.build,
    projeto.escolha,
    projeto.escolha.faixa_origem ?? "economica",
    deps,
  );
}

/**
 * Valida e calcula uma escolha para salvar como versão. Devolve o motivo quando a combinação nem
 * pode ser montada (peça que saiu do catálogo, kit sem sentido...).
 */
export function snapshotFor(
  choice: BuildChoice,
  deps: ViewDeps,
): { snapshot: VersionSnapshot; report: ProjectReport } | { erro: string } {
  const { catalog } = deps.loaded;
  const config = deps.config ?? DEFAULT_DRONE_CONFIG;
  const archetype = archetypeOf(catalog, choice.arquetipo_id);
  if (!archetype) return { erro: `O arquétipo "${choice.arquetipo_id}" não existe no catálogo.` };
  const montado = materializeChoice(choice, archetype, catalog);
  if (!montado.build) return { erro: montado.descartado };
  const report = buildProjectReport(
    montado.build,
    archetype,
    catalog,
    config,
    deps.ferramentasQueTenho,
  );
  return {
    report,
    snapshot: {
      escolha: choice,
      pecas: montado.build.itens.map((i) => i.componente),
      validacao: report.validacao,
      metricas: report.metricas,
      dificuldade: report.dificuldade,
      custos: report.custos,
      locais: report.locais,
      alertas: report.alertas,
      cena: buildDroneScene(montado.build, archetype),
    },
  };
}
