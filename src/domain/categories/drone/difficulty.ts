import {
  DIFFICULTY_DOMAINS,
  DIFFICULTY_LABELS,
  type DifficultyDomain,
  type DifficultyLabel,
  type DifficultyLevel,
  DOMAIN_LABEL,
  LEVEL_LABEL,
} from "@/domain/core/difficulty";

import type { Build } from "./build";
import type { DroneConfig } from "./config";
import { conditionMatches } from "./firmware";
import type { Archetype } from "./schema";

/*
 * Dificuldade multi-domínio (SPEC B.8), derivada dos passos de montagem que valem para o build.
 * Nada aqui vem do LLM: o nível de cada domínio é o maior nível exigido pelos passos.
 */

export type DomainDifficulty = {
  dominio: DifficultyDomain;
  rotulo: string;
  nivel: DifficultyLevel;
  nivel_rotulo: string;
  /** Horas para um leigo aprender o necessário (heurística, faixa). */
  horas_aprendizado: [number, number];
  /** Horas dos passos que usam o domínio (montagem, configuração, testes). */
  horas_passos: [number, number];
  /** Passos que usam o domínio; o objetivo de cada um é o que se aprende fazendo. */
  passos: Array<{ id: string; titulo: string; nivel: DifficultyLevel; objetivo: string }>;
  riscos: string[];
};

export type DifficultyReport = {
  dominios: DomainDifficulty[];
  nota: number;
  rotulo: DifficultyLabel;
  /** Aprendizado + todos os passos (cada passo contado uma vez). */
  horas_totais: [number, number];
  formula: string;
};

const horas = (minutos: number) => Math.round((minutos / 60) * 10) / 10;
/** Número com vírgula decimal (texto da interface em PT-BR). */
const dec = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function computeDifficulty(
  build: Build,
  archetype: Archetype,
  config: DroneConfig,
): DifficultyReport {
  // Passos opcionais aparecem no guia, mas não pesam na nota nem nas horas obrigatórias.
  const passos = archetype.passos.filter((p) => conditionMatches(p.condicao, build) && !p.opcional);
  const cfg = config.dificuldade;

  const dominios: DomainDifficulty[] = [];
  for (const dominio of DIFFICULTY_DOMAINS) {
    const usados = passos.filter((p) => p.dominios[dominio] !== undefined);
    if (usados.length === 0) continue;
    const nivel = Math.max(...usados.map((p) => p.dominios[dominio] ?? 0)) as DifficultyLevel;
    const [aMin, aMax] = cfg.horas_aprendizado_por_nivel[nivel] ?? [0, 0];
    dominios.push({
      dominio,
      rotulo: DOMAIN_LABEL[dominio],
      nivel,
      nivel_rotulo: LEVEL_LABEL[nivel],
      horas_aprendizado: [aMin, aMax],
      horas_passos: [
        horas(usados.reduce((s, p) => s + p.tempo_min[0], 0)),
        horas(usados.reduce((s, p) => s + p.tempo_min[1], 0)),
      ],
      passos: usados.map((p) => ({
        id: p.id,
        titulo: p.titulo,
        nivel: (p.dominios[dominio] ?? 0) as DifficultyLevel,
        objetivo: p.objetivo,
      })),
      riscos: [...new Set(usados.flatMap((p) => p.riscos))],
    });
  }

  // Média dos níveis ponderada pelas horas de passo de cada domínio (ponto médio da faixa).
  const peso = (d: DomainDifficulty) => (d.horas_passos[0] + d.horas_passos[1]) / 2;
  const somaPesos = dominios.reduce((s, d) => s + peso(d), 0);
  const media = somaPesos > 0 ? dominios.reduce((s, d) => s + d.nivel * peso(d), 0) / somaPesos : 0;
  const maximo = dominios.length > 0 ? Math.max(...dominios.map((d) => d.nivel)) : 0;
  const nota = Math.round((cfg.peso_maximo * maximo + cfg.peso_media * media) * 100) / 100;
  const indice = cfg.limites_rotulo.findIndex((limite) => nota < limite);
  const rotulo =
    DIFFICULTY_LABELS[indice === -1 ? DIFFICULTY_LABELS.length - 1 : indice] ?? "Especialista";

  const passosMin = horas(passos.reduce((s, p) => s + p.tempo_min[0], 0));
  const passosMax = horas(passos.reduce((s, p) => s + p.tempo_min[1], 0));
  return {
    dominios,
    nota,
    rotulo,
    horas_totais: [
      dominios.reduce((s, d) => s + d.horas_aprendizado[0], passosMin),
      dominios.reduce((s, d) => s + d.horas_aprendizado[1], passosMax),
    ],
    formula: `${dec(cfg.peso_maximo)} × nível máximo (${maximo}) + ${dec(cfg.peso_media)} × média ponderada pelas horas (${dec(media)}) = ${dec(nota)}`,
  };
}
