import type { ValidationReport } from "@/domain/core/validation";

import {
  type Build,
  type BuildItem,
  type BuildOptions,
  DEFAULT_BUILD_OPTIONS,
  firstOf,
  receiverOf,
  type TelemetryOption,
  type Tier,
} from "./build";
import type { DroneCatalog } from "./catalog";
import { type BuildMetrics, validateBuild } from "./compatibility";
import type { DroneConfig } from "./config";
import { computeCosts, type CostReport } from "./costs";
import type { Archetype, Component } from "./schema";

/*
 * Solver (SPEC B.7/B.10): monta as opções econômica, equilibrada e premium de um arquétipo a
 * partir do catálogo, de forma determinística.
 *
 * Política (documentada no ADR-0019):
 * 1. Candidatas de cada slot: peças da categoria do slot, que passam no filtro de specs do slot e
 *    que o curador marcou para a faixa (peça sem marca vale para todas).
 * 2. Todas as combinações são validadas; qualquer falha bloqueante descarta a combinação.
 * 3. Entre as válidas, vence a que tem relatório completo (sem "sem dado" bloqueante), depois a de
 *    menor custo de peças, depois a que paira mais perto de 50% do acelerador.
 * 4. Kits: se um kit traz várias peças escolhidas (ex.: ARF), compra-se o kit (menos montagem e
 *    peças garantidas na mesma caixa). Peça que vem na caixa de outra (ex.: antena do VTX) não é
 *    comprada à parte.
 * 5. Telemetria (ADR-0017): ELRS MAVLink quando rádio e receptor permitem; senão Wi-Fi no drone,
 *    se houver módulo; senão nenhuma. Uma opção explícita do usuário prevalece.
 */

export const TIERS: readonly Tier[] = ["economica", "equilibrada", "premium"];
const MAX_COMBINACOES = 50_000;

export type SlotChoice = {
  slot: string;
  componente_id: string | null;
  candidatas: number;
  motivo: string;
};

export type TierPlan = {
  faixa: Tier;
  build: Build;
  validacao: ValidationReport;
  metricas: BuildMetrics;
  custos: CostReport;
  escolhas: SlotChoice[];
  /** Combinações válidas consideradas nesta faixa. */
  validas: number;
};

export type SolverInput = {
  archetype: Archetype;
  catalog: DroneCatalog;
  config: DroneConfig;
  opcoes?: Partial<BuildOptions>;
  ferramentasQueTenho?: ReadonlySet<string>;
};

export type SolverResult = {
  faixas: TierPlan[];
  /** Faixas sem nenhuma combinação válida, com as regras que mais derrubaram combinações. */
  sem_solucao: Array<{ faixa: Tier; motivos: string[] }>;
};

function matchesFilter(c: Component, filtro: Record<string, unknown> | undefined): boolean {
  if (!filtro) return true;
  const specs = c.specs as Record<string, unknown>;
  return Object.entries(filtro).every(([k, v]) => specs[k] === v);
}

export function candidatesFor(
  slot: Archetype["slots"][number],
  catalog: DroneCatalog,
  faixa: Tier,
): Component[] {
  return catalog.componentes.filter(
    (c) =>
      slot.categorias.includes(c.categoria) &&
      matchesFilter(c, slot.filtro_specs) &&
      (c.faixas.length === 0 || c.faixas.includes(faixa)),
  );
}

/** Telemetria padrão do ADR-0017, a partir das peças escolhidas. */
export function defaultTelemetry(build: Build): TelemetryOption {
  const radio = firstOf(build, "radio_tx")?.componente.specs;
  const rx = receiverOf(build)?.specs;
  if (radio?.esp && radio.backpack_wifi && rx?.esp && rx.saidas?.includes("MAVLink")) {
    return "elrs_mavlink";
  }
  return firstOf(build, "telemetria") ? "wifi_no_drone" : "nenhuma";
}

/** Marca peças que vêm na caixa de outra e troca grupos de peças por kits. */
export function applyPurchasePlan(build: Build, catalog: DroneCatalog): Build {
  const ids = new Set(build.itens.map((i) => i.componente.id));
  let itens: BuildItem[] = build.itens.map((i) => ({ ...i }));

  for (const kit of catalog.componentes.filter((c) => c.categoria === "kit")) {
    const cobre = kit.inclui.filter((inc) => ids.has(inc.componente_id));
    // Só vale a pena se o kit trouxer pelo menos duas peças do projeto.
    if (cobre.length < 2) continue;
    const atende = cobre.every((inc) => {
      const item = itens.find((i) => i.componente.id === inc.componente_id);
      return item !== undefined && inc.quantidade >= item.quantidade_no_drone;
    });
    if (!atende) continue;
    const cobertos = new Set(cobre.map((c) => c.componente_id));
    itens = itens.map((i) => (cobertos.has(i.componente.id) ? { ...i, fornecido_por: kit.id } : i));
    itens.push({
      slot: `kit:${kit.id}`,
      componente: kit,
      quantidade_no_drone: 0,
      quantidade_compra: 1,
    });
  }

  // Peça que já vem na caixa de outra peça comprada (ex.: antena junto do VTX).
  for (const dono of itens.filter((i) => !i.fornecido_por)) {
    for (const inc of dono.componente.inclui) {
      itens = itens.map((i) =>
        i.componente.id === inc.componente_id && !i.fornecido_por && i !== dono
          ? { ...i, fornecido_por: dono.componente.id }
          : i,
      );
    }
  }
  return { ...build, itens };
}

function cartesian<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>(
    (acc, list) => acc.flatMap((prefix) => list.map((x) => [...prefix, x])),
    [[]],
  );
}

const midpoint = (c: CostReport) => (c.total_pecas.min_centavos + c.total_pecas.max_centavos) / 2;

export function solve(input: SolverInput): SolverResult {
  const { archetype, catalog, config } = input;
  const profile = catalog.perfis_firmware.find((p) => p.id === archetype.perfil_firmware);
  const faixas: TierPlan[] = [];
  const semSolucao: SolverResult["sem_solucao"] = [];

  for (const faixa of TIERS) {
    const listas = archetype.slots.map((slot) => {
      const cands: Array<Component | null> = candidatesFor(slot, catalog, faixa);
      return slot.obrigatorio ? cands : [null, ...cands];
    });
    const total = listas.reduce((n, l) => n * Math.max(l.length, 1), 1);
    if (listas.some((l) => l.length === 0) || total > MAX_COMBINACOES) {
      const vazio = archetype.slots.filter((_, i) => listas[i]?.length === 0).map((s) => s.slot);
      semSolucao.push({
        faixa,
        motivos:
          vazio.length > 0
            ? [`Sem peça no catálogo para: ${vazio.join(", ")}`]
            : ["Combinações demais"],
      });
      continue;
    }

    let melhor: Omit<TierPlan, "escolhas" | "validas"> | undefined;
    let validas = 0;
    const falhas = new Map<string, number>();
    for (const combo of cartesian(listas)) {
      const itens: BuildItem[] = [];
      archetype.slots.forEach((slot, i) => {
        const c = combo[i];
        if (!c) return;
        itens.push({
          slot: slot.slot,
          componente: c,
          quantidade_no_drone: slot.quantidade,
          quantidade_compra: slot.compra_por_faixa?.[faixa] ?? slot.quantidade,
        });
      });
      const rascunho: Build = {
        arquetipo_id: archetype.id,
        itens,
        opcoes: { ...DEFAULT_BUILD_OPTIONS, celular: "android", ...input.opcoes },
      };
      const telemetria = input.opcoes?.telemetria ?? defaultTelemetry(rascunho);
      // Módulo de telemetria Wi-Fi só faz sentido se for a opção escolhida.
      if (telemetria !== "wifi_no_drone" && firstOf(rascunho, "telemetria")) continue;
      const build = applyPurchasePlan(
        { ...rascunho, opcoes: { ...rascunho.opcoes, telemetria } },
        catalog,
      );
      const { report, metrics } = validateBuild({
        build,
        archetype,
        thrustTables: catalog.empuxo,
        config,
        firmwareProfile: profile,
      });
      if (report.bloqueado) {
        for (const r of report.resultados) {
          if (r.status === "falhou" && r.severidade === "bloqueante") {
            falhas.set(r.titulo, (falhas.get(r.titulo) ?? 0) + 1);
          }
        }
        continue;
      }
      validas++;
      const custos = computeCosts(build, archetype, catalog, input.ferramentasQueTenho);
      const candidato = { faixa, build, validacao: report, metricas: metrics, custos };
      if (!melhor || better(candidato, melhor, config)) melhor = candidato;
    }

    if (!melhor) {
      const motivos = [...falhas.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t]) => t);
      semSolucao.push({ faixa, motivos });
      continue;
    }
    const escolhido = melhor;
    const escolhas: SlotChoice[] = archetype.slots.map((slot, i) => {
      const item = escolhido.build.itens.find((it) => it.slot === slot.slot);
      const n = listas[i]?.filter((c) => c !== null).length ?? 0;
      return {
        slot: slot.slot,
        componente_id: item?.componente.id ?? null,
        candidatas: n,
        motivo: !item
          ? "Não usado nesta configuração."
          : n <= 1
            ? "Única opção desta faixa no catálogo, e passou em todas as regras bloqueantes."
            : `Escolhida entre ${n} opções desta faixa: a combinação mais barata que passa em todas as regras bloqueantes.`,
      };
    });
    faixas.push({ ...escolhido, escolhas, validas });
  }
  return { faixas, sem_solucao: semSolucao };
}

function better(
  a: Omit<TierPlan, "escolhas" | "validas">,
  b: Omit<TierPlan, "escolhas" | "validas">,
  config: DroneConfig,
): boolean {
  if (a.validacao.incompleto !== b.validacao.incompleto) return !a.validacao.incompleto;
  const ca = midpoint(a.custos);
  const cb = midpoint(b.custos);
  if (ca !== cb) return ca < cb;
  const ideal = config.hover.ideal_pct;
  const ha = Math.abs((a.metricas.propulsion.hover?.throttle_pct ?? 100) - ideal);
  const hb = Math.abs((b.metricas.propulsion.hover?.throttle_pct ?? 100) - ideal);
  return ha < hb;
}
