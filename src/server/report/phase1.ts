import type { DroneCatalog } from "@/domain/categories/drone/catalog";
import type { DroneConfig } from "@/domain/categories/drone/config";
import { computeDifficulty } from "@/domain/categories/drone/difficulty";
import { buildProjectReport, type ProjectReport } from "@/domain/categories/drone/project";
import type { ReadyMadeVerdict } from "@/domain/categories/drone/ready-made";
import type { Archetype } from "@/domain/categories/drone/schema";
import { compareSizeClasses } from "@/domain/categories/drone/size-comparison";
import { solve, type TierPlan } from "@/domain/categories/drone/solver";
import { formatRange } from "@/domain/core/money";
import { SEAL } from "@/domain/core/verification";

/*
 * Relatório em texto dos builds de referência (SPEC B.18, aceite da Fase 1), para o dono do
 * projeto revisar o motor de cálculo no terminal antes de existir interface (Fase 3).
 * Só formata o que o domínio calcula: nenhum número nasce aqui.
 */

export type Phase1ReportOptions = {
  /** Só os arquétipos cujo id começa com este texto (ex.: "a3"). */
  filtro?: string;
  /** Mostra o motivo de cada escolha do solver e a explicação técnica das regras. */
  detalhes?: boolean;
};

const FAIXA_ROTULO: Record<TierPlan["faixa"], string> = {
  economica: "econômica",
  equilibrada: "equilibrada",
  premium: "premium",
};

const VEREDITO: Record<ReadyMadeVerdict, string> = {
  pronto_mais_barato: "pronto sai MAIS BARATO",
  montar_mais_barato: "montar sai mais barato",
  parecido: "preço parecido",
  sem_preco: "sem preço para comparar",
};

const num = (n: number, casas = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
const selo = (s: keyof typeof SEAL) => SEAL[s].rotulo;

function tierSection(plano: TierPlan, projeto: ProjectReport, detalhes: boolean): string[] {
  const out: string[] = [];
  const { auw, propulsion, flight } = projeto.metricas;
  const precoDe = new Map(projeto.custos.pecas.map((l) => [l.id, l]));

  out.push("", `── Faixa ${FAIXA_ROTULO[plano.faixa]} ──`, "Peças:");
  for (const item of plano.build.itens) {
    const c = item.componente;
    const linha = precoDe.get(c.id);
    const preco = item.fornecido_por
      ? `vem na caixa de ${item.fornecido_por}`
      : linha?.faixa
        ? formatRange(linha.faixa)
        : "sem preço pesquisado";
    const qtd = item.quantidade_compra > 1 ? ` ×${item.quantidade_compra}` : "";
    out.push(`  - ${item.slot}: ${c.marca} ${c.modelo}${qtd} (${preco})`);
    if (detalhes) {
      const motivo = plano.escolhas.find((e) => e.slot === item.slot)?.motivo;
      if (motivo) out.push(`      por quê: ${motivo}`);
    }
  }

  const numeros: string[] = [];
  if (auw.massa_total_g !== undefined) numeros.push(`peso ${num(auw.massa_total_g, 0)} g`);
  if (propulsion.twr !== undefined) numeros.push(`TWR ${num(propulsion.twr, 2)}`);
  if (propulsion.hover) {
    const ate = propulsion.hover.precisao === "abaixo_da_tabela" ? "até " : "";
    numeros.push(`pairar ${ate}${num(propulsion.hover.throttle_pct, 0)}% do acelerador`);
  }
  if (flight.min_minutos !== undefined && flight.max_minutos !== undefined) {
    numeros.push(`voo ${num(flight.min_minutos)} a ${num(flight.max_minutos)} min`);
  }
  out.push(`Números (${selo(flight.selo)}): ${numeros.join(" · ") || "sem dado"}`);

  const custos = projeto.custos;
  out.push(
    `Custo: peças ${formatRange(custos.total_pecas)} · ferramentas e EPI essenciais ` +
      `${formatRange(custos.total_ferramentas)} · total ${formatRange(custos.total)} ` +
      `(${selo(custos.total.status)})`,
  );
  if (custos.sem_preco.length > 0) {
    out.push(`  Sem preço pesquisado (fora do total): ${custos.sem_preco.join(", ")}`);
  }

  const d = projeto.dificuldade;
  out.push(
    `Dificuldade: ${d.rotulo} (nota ${num(d.nota, 2)}) · ${num(d.horas_totais[0], 0)} a ` +
      `${num(d.horas_totais[1], 0)} h entre aprender e fazer`,
  );

  const r = projeto.validacao.resultados;
  const bloqueantes = r.filter((x) => x.severidade === "bloqueante" && x.status === "falhou");
  const alertas = r.filter((x) => x.severidade === "alerta" && x.status === "falhou");
  const semDado = r.filter((x) => x.status === "sem_dado");
  out.push(
    `Regras: ${r.filter((x) => x.status === "passou").length} passaram · ` +
      `${bloqueantes.length} bloqueante(s) falharam · ${alertas.length} alerta(s) · ` +
      `${semDado.length} sem dado`,
  );
  for (const x of [...bloqueantes, ...alertas, ...semDado]) {
    const tipo =
      x.status === "sem_dado" ? "sem dado" : x.severidade === "bloqueante" ? "BLOQUEIA" : "alerta";
    out.push(`  [${tipo}] ${x.titulo}${detalhes ? `: ${x.explicacao_tecnica}` : ""}`);
  }

  out.push(
    `Alertas de segurança no guia: ${projeto.alertas.length} · passos: ${projeto.passos.length} · ` +
      `parâmetros de firmware: ${projeto.parametros.length}` +
      (projeto.parametros_pendentes.length > 0
        ? ` (pendentes: ${projeto.parametros_pendentes.join(", ")})`
        : ""),
  );

  for (const o of projeto.prontos.opcoes) {
    const total = o.total ? formatRange(o.total) : "sem preço";
    const comp = o.complementos.length > 0 ? ` + ${o.complementos.length} complemento(s)` : "";
    out.push(`Pronto: ${o.nome} (${o.tipo}${comp}) ${total} → ${VEREDITO[o.veredito]}`);
  }
  return out;
}

function sizeComparisonSection(
  archetype: Archetype,
  plano450: TierPlan,
  catalog: DroneCatalog,
  config: DroneConfig,
): string[] {
  const fpv = catalog.arquetipos.find((a) => a.firmware === "Betaflight" && a.id.includes("5pol"));
  if (!fpv) return [];
  const plano5 = solve({ archetype: fpv, catalog, config }).faixas[0];
  if (!plano5) return [];
  const comparacao = compareSizeClasses(
    archetype,
    [
      {
        rotulo: "Classe 450 mm",
        plano: plano450,
        dificuldade: computeDifficulty(plano450.build, archetype, config),
      },
      {
        rotulo: 'Classe 5"',
        plano: plano5,
        dificuldade: computeDifficulty(plano5.build, fpv, config),
      },
    ],
    catalog,
    config,
  );
  const out = ["", '── Comparação de tamanho: 450 mm × 5" (faixa econômica) ──'];
  for (const k of comparacao.criterios) {
    const valores = k.valores
      .map((v) => `${v.rotulo} ${v.valor === undefined ? "sem dado" : num(v.valor)}`)
      .join(" | ");
    out.push(`  ${k.titulo} (${k.unidade}, peso ${num(k.peso, 2)}): ${valores}`);
  }
  for (const c of comparacao.candidatos) {
    const falta = c.atende ? "" : ` · não atende: ${c.faltando.join("; ")}`;
    out.push(`  ${c.rotulo}: nota ${num(c.nota, 2)}${falta}`);
  }
  out.push(`  Escolha: ${comparacao.escolha ?? "nenhuma"}. ${comparacao.explicacao}`);
  return out;
}

export function phase1Report(
  catalog: DroneCatalog,
  config: DroneConfig,
  opcoes: Phase1ReportOptions = {},
): string {
  const detalhes = opcoes.detalhes ?? false;
  const arquetipos = catalog.arquetipos.filter(
    (a) => !opcoes.filtro || a.id.startsWith(opcoes.filtro),
  );
  const out: string[] = [
    "From Scratch: builds de referência (motor de cálculo determinístico, sem LLM)",
    "Preços: estimativas em R$ convertidas do preço da loja oficial em US$ (câmbio e tributos em",
    "data/catalog/drone/parametros/importacao.json), sem frete. Peças ainda não verificadas por você.",
  ];
  if (arquetipos.length === 0)
    out.push("", `Nenhum arquétipo com id começando em "${opcoes.filtro}".`);

  for (const archetype of arquetipos) {
    out.push(
      "",
      `══ ${archetype.nome} (${archetype.id}) · ${archetype.firmware} ══`,
      archetype.para_quem,
    );
    const resultado = solve({ archetype, catalog, config });
    for (const plano of resultado.faixas) {
      const projeto = buildProjectReport(plano.build, archetype, catalog, config);
      out.push(...tierSection(plano, projeto, detalhes));
    }
    for (const s of resultado.sem_solucao) {
      out.push("", `Faixa ${FAIXA_ROTULO[s.faixa]}: SEM SOLUÇÃO. ${s.motivos.join("; ")}`);
    }
    const plano450 = resultado.faixas[0];
    if (archetype.firmware === "ArduPilot" && plano450) {
      out.push(...sizeComparisonSection(archetype, plano450, catalog, config));
    }
  }
  return out.join("\n");
}
