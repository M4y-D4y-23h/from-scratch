import { firstOf } from "./build";
import { nominalBatteryVoltage } from "./calculations";
import type { DroneCatalog } from "./catalog";
import { validateBuild } from "./compatibility";
import type { DroneConfig } from "./config";
import type { DifficultyReport } from "./difficulty";
import type { Archetype } from "./schema";
import type { TierPlan } from "./solver";

/*
 * Comparação de classes de tamanho (SPEC B.2.1): para o Arquétipo 1, a classe ~450 mm (hélices de
 * ~10") contra 5"–7", pelo critério "mais fácil e seguro para um leigo, dentro do orçamento".
 *
 * 1. Requisitos primeiro: cada candidato é validado com as regras do arquétipo-alvo. Quem tem regra
 *    bloqueante falhando (ex.: sem GPS com bússola, controladora sem ArduPilot) não pode ser a
 *    escolha, mas continua na tabela para comparação.
 * 2. Entre os que atendem, vence a maior nota ponderada: cada critério vira 0 a 1 em proporção ao
 *    melhor candidato (valor ÷ melhor, ou melhor ÷ valor quando menor é melhor), para uma diferença
 *    pequena valer pouco, e é multiplicado pelo peso de config.comparacao_tamanho (a aprovar).
 */

export type SizeCandidate = {
  /** Ex.: "Classe 450 mm (Holybro X500 V2)". */
  rotulo: string;
  plano: TierPlan;
  dificuldade: DifficultyReport;
};

type CriterionId = keyof DroneConfig["comparacao_tamanho"]["pesos"];

export type SizeCriterion = {
  id: CriterionId;
  titulo: string;
  unidade: string;
  melhor_maior: boolean;
  peso: number;
  valores: Array<{ rotulo: string; valor?: number; pontos: number }>;
};

export type SizeComparison = {
  arquetipo_id: string;
  candidatos: Array<{ rotulo: string; atende: boolean; faltando: string[]; nota: number }>;
  criterios: SizeCriterion[];
  /** Rótulo do candidato escolhido; ausente se nenhum atende aos requisitos. */
  escolha?: string;
  explicacao: string;
};

const CRITERIOS: Array<{
  id: CriterionId;
  titulo: string;
  unidade: string;
  melhor_maior: boolean;
  valor: (c: SizeCandidate, config: DroneConfig) => number | undefined;
}> = [
  {
    id: "facilidade",
    titulo: "Dificuldade (nota da SPEC B.8)",
    unidade: "nota de 0 a 5",
    melhor_maior: false,
    valor: (c) => c.dificuldade.nota,
  },
  {
    id: "seguranca",
    titulo: "Potência máxima dos motores (quanto menor, menos violento)",
    unidade: "W",
    melhor_maior: false,
    valor: (c, config) => {
      const battery = firstOf(c.plano.build, "bateria")?.componente;
      const v = battery ? nominalBatteryVoltage(battery, config) : undefined;
      const i = c.plano.metricas.propulsion.corrente_max_total_a;
      return v !== undefined && i !== undefined ? v * i : undefined;
    },
  },
  {
    id: "autonomia",
    titulo: "Autonomia máxima estimada",
    unidade: "min",
    melhor_maior: true,
    valor: (c) => c.plano.metricas.flight.max_minutos,
  },
  {
    id: "espaco_montagem",
    titulo: "Entre-eixos (espaço para montar)",
    unidade: "mm",
    melhor_maior: true,
    valor: (c) => firstOf(c.plano.build, "frame")?.componente.specs.distancia_entre_eixos_mm,
  },
  {
    id: "custo",
    titulo: "Custo das peças (ponto médio da faixa)",
    unidade: "R$",
    melhor_maior: false,
    valor: (c) =>
      (c.plano.custos.total_pecas.min_centavos + c.plano.custos.total_pecas.max_centavos) / 200,
  },
];

export function compareSizeClasses(
  alvo: Archetype,
  candidatos: readonly SizeCandidate[],
  catalog: DroneCatalog,
  config: DroneConfig,
): SizeComparison {
  const profile = catalog.perfis_firmware.find((p) => p.id === alvo.perfil_firmware);
  const requisitos = candidatos.map((c) => {
    const { report } = validateBuild({
      build: c.plano.build,
      archetype: alvo,
      thrustTables: catalog.empuxo,
      config,
      firmwareProfile: profile,
    });
    const faltando = report.resultados
      .filter((r) => r.severidade === "bloqueante" && r.status === "falhou")
      .map((r) => r.titulo);
    return { rotulo: c.rotulo, atende: faltando.length === 0, faltando };
  });

  const pesos = config.comparacao_tamanho.pesos;
  const criterios: SizeCriterion[] = CRITERIOS.map((k) => {
    const brutos = candidatos.map((c) => ({ rotulo: c.rotulo, valor: k.valor(c, config) }));
    const definidos = brutos.flatMap((b) =>
      b.valor === undefined || b.valor <= 0 ? [] : [b.valor],
    );
    const melhor = k.melhor_maior ? Math.max(...definidos) : Math.min(...definidos);
    return {
      id: k.id,
      titulo: k.titulo,
      unidade: k.unidade,
      melhor_maior: k.melhor_maior,
      peso: pesos[k.id],
      valores: brutos.map((b) => {
        if (b.valor === undefined || b.valor <= 0) return { ...b, pontos: 0 };
        return { ...b, pontos: k.melhor_maior ? b.valor / melhor : melhor / b.valor };
      }),
    };
  });

  const nota = (rotulo: string) =>
    criterios.reduce(
      (s, k) => s + k.peso * (k.valores.find((v) => v.rotulo === rotulo)?.pontos ?? 0),
      0,
    );
  const resumo = requisitos.map((r) => ({ ...r, nota: nota(r.rotulo) }));
  const escolha = resumo
    .filter((r) => r.atende)
    .sort((a, b) => b.nota - a.nota || a.rotulo.localeCompare(b.rotulo))[0];

  const fora = resumo.filter((r) => !r.atende);
  const explicacao = escolha
    ? [
        `Escolha para ${alvo.nome}: ${escolha.rotulo} (nota ${escolha.nota.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} de 1).`,
        ...fora.map(
          (r) => `${r.rotulo} não atende aos requisitos do arquétipo: ${r.faltando.join("; ")}.`,
        ),
      ].join(" ")
    : "Nenhum candidato atende aos requisitos do arquétipo.";

  return {
    arquetipo_id: alvo.id,
    candidatos: resumo,
    criterios,
    escolha: escolha?.rotulo,
    explicacao,
  };
}
