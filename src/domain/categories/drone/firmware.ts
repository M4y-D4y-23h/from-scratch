import { type Build, firstOf } from "./build";
import type { FirmwareProfile } from "./schema";

/*
 * Parâmetros de firmware do projeto: aplica as condições (tipo de telemetria, peças presentes) e
 * calcula os valores que dependem do build (ex.: BATT_LOW_MAH = 20% da capacidade da bateria).
 * Sempre a partir do perfil versionado no catálogo, nunca de texto gerado pelo LLM.
 */

export type StepCondition = NonNullable<FirmwareProfile["parametros"][number]["condicao"]>;

/** A condição vale para este build? Sem condição = vale sempre. */
export function conditionMatches(cond: StepCondition | undefined, build: Build): boolean {
  if (!cond) return true;
  const categorias = new Set<string>(build.itens.map((i) => i.componente.categoria));
  const ids = new Set(build.itens.map((i) => i.componente.id));
  if (cond.tem_categoria && !cond.tem_categoria.some((c) => categorias.has(c))) return false;
  if (cond.sem_categoria?.some((c) => categorias.has(c))) return false;
  if (cond.telemetria && !cond.telemetria.includes(build.opcoes.telemetria)) return false;
  if (cond.tem_componente && !cond.tem_componente.some((id) => ids.has(id))) return false;
  return true;
}

export type ResolvedParam = {
  nome: string;
  valor: number | string;
  unidade?: string;
  explicacao: string;
  /** true se o valor foi calculado a partir do build. */
  calculado: boolean;
};

export function resolveFirmwareParams(
  profile: FirmwareProfile,
  build: Build,
): { parametros: ResolvedParam[]; faltando: string[] } {
  const battery = firstOf(build, "bateria")?.componente.specs;
  const variaveis: Record<"celulas" | "capacidade_mah", number | undefined> = {
    celulas: battery?.celulas,
    capacidade_mah: battery?.capacidade_mah,
  };
  const parametros: ResolvedParam[] = [];
  const faltando: string[] = [];
  const vistos = new Set<string>();
  for (const p of profile.parametros) {
    if (!conditionMatches(p.condicao, build) || vistos.has(p.nome)) continue;
    let valor = p.valor;
    if (p.calculo) {
      const base = variaveis[p.calculo.variavel];
      if (base === undefined) {
        faltando.push(p.nome);
        continue;
      }
      const casas = p.calculo.casas ?? 1;
      valor = Number((base * p.calculo.fator).toFixed(casas));
    }
    if (valor === undefined) continue;
    vistos.add(p.nome);
    parametros.push({
      nome: p.nome,
      valor,
      unidade: p.unidade,
      explicacao: p.explicacao,
      calculado: p.calculo !== undefined,
    });
  }
  return { parametros, faltando };
}
