/*
 * Evals do pipeline (SPEC B.17): os 13 pedidos de tests/evals/casos.ts, com critérios
 * verificáveis. Com o Claude, mostra o custo estimado e pede confirmação antes de gastar.
 * Uso:
 *   pnpm evals              com a IA (precisa de ANTHROPIC_API_KEY no .env.local)
 *   pnpm evals --simples    modo simples (palavras-chave), sem custo
 *   pnpm evals 2b 11        só alguns casos
 *   pnpm evals --sim        não pergunta antes (para quem já conferiu o custo)
 * O relatório completo vai para data/local/evals/ (fora do git).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";

import { z } from "zod";

import { DEFAULT_DRONE_CONFIG } from "@/domain/categories/drone/config";
import { loadDroneCatalog } from "@/server/catalog/load";
import { getDb } from "@/server/db";
import type { CallRecord } from "@/server/llm/client";
import { LLM_ROUTES, PRICING_CHECKED_ON, PRICING_USD_PER_MTOK } from "@/server/llm/config";
import { ANALYSIS_SYSTEM, EXPLANATION_SYSTEM } from "@/server/llm/prompts";
import { explanationSchema, requestAnalysisSchema } from "@/server/llm/schemas";
import {
  type Analysis,
  type Analyzer,
  explainChoice,
  llmAnalyzer,
  runPipeline,
  simpleAnalyzer,
} from "@/server/pipeline/run";

import { EVAL_CASES } from "../tests/evals/casos";
import { type CaseReport, runEvalCase } from "../tests/evals/run-cases";

const args = process.argv.slice(2);
const simples = args.includes("--simples");
const semPerguntar = args.includes("--sim");
const filtro = args.filter((a) => !a.startsWith("--"));
const casos = filtro.length > 0 ? EVAL_CASES.filter((c) => filtro.includes(c.id)) : EVAL_CASES;

// O Next lê o .env.local sozinho; aqui (fora do Next) é preciso carregar.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/** 1.2345 → "1,23" (formato brasileiro). */
const br = (n: number, casas = 2) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Tokens aproximados de um texto em português (cerca de 3 letras por token; só para estimar). */
const tokensAprox = (texto: string) => Math.ceil(texto.length / 3);

function preco(modelo: string) {
  const p = PRICING_USD_PER_MTOK[modelo];
  if (!p) throw new Error(`sem preço para ${modelo} em src/server/llm/config.ts`);
  return p;
}

/**
 * Estimativa: entrada medida pelo tamanho dos textos (prompt + schema + pedido) e saída numa
 * faixa larga (o modelo pensa antes de responder; com esforço alto, pensa mais).
 */
function estimate() {
  const analise = LLM_ROUTES.analise_pedido;
  const explicacao = LLM_ROUTES.explicacao_projeto;
  const entradaAnalise =
    tokensAprox(ANALYSIS_SYSTEM) +
    tokensAprox(JSON.stringify(z.toJSONSchema(requestAnalysisSchema)));
  const entradaExplicacao =
    tokensAprox(EXPLANATION_SYSTEM) +
    tokensAprox(JSON.stringify(z.toJSONSchema(explanationSchema))) +
    400;
  const chamadasAnalise = casos.length;
  const chamadasExplicacao = casos.length;
  const faixa = (
    modelo: string,
    entrada: number,
    saidaMin: number,
    saidaMax: number,
    n: number,
  ) => {
    const p = preco(modelo);
    return [
      (n * (entrada * p.input + saidaMin * p.output)) / 1e6,
      (n * (entrada * p.input + saidaMax * p.output)) / 1e6,
    ] as const;
  };
  const a = faixa(analise.model, entradaAnalise, 300, 3000, chamadasAnalise);
  const e = faixa(explicacao.model, entradaExplicacao, 500, 8000, chamadasExplicacao);
  return {
    chamadas: chamadasAnalise + chamadasExplicacao,
    min: a[0] + e[0],
    max: a[1] + e[1],
  };
}

async function confirm(pergunta: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^s(im)?$/i.test((await rl.question(pergunta)).trim());
  } finally {
    rl.close();
  }
}

function printCase(r: CaseReport, extra?: string) {
  console.log(`\n${r.ok ? "✅" : "❌"} Caso ${r.id}: "${r.pedido}"`);
  console.log(`   Esperado: ${r.esperado}`);
  if (r.erro) console.log(`   ERRO: ${r.erro}`);
  for (const e of r.etapas) {
    const resp = e.respostas ? ` respostas ${JSON.stringify(e.respostas)}` : "";
    console.log(`   Etapa ${e.etapa}${resp} → ${e.tipo} (${e.modo})`);
    for (const c of e.criterios) {
      console.log(
        `     ${c.ok ? "✓" : "✗"} ${c.descricao}${!c.ok && c.detalhe ? ` [${c.detalhe}]` : ""}`,
      );
    }
  }
  if (extra) console.log(`   ${extra}`);
}

async function main() {
  const loaded = loadDroneCatalog();
  const ctx = { loaded, config: DEFAULT_DRONE_CONFIG };
  const usos: CallRecord[] = [];
  const cambio = loaded.catalog.importacao?.cambio.usd_brl;
  let analisar: Analyzer = simpleAnalyzer;
  let registro: { db: ReturnType<typeof getDb>; cambioBrl: number } | undefined;

  if (!simples) {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      console.error(
        "Sem ANTHROPIC_API_KEY no .env.local. Coloque a chave ou rode `pnpm evals --simples` (sem IA).",
      );
      process.exit(1);
    }
    const est = estimate();
    const reais = (usd: number) => (cambio ? ` (até cerca de R$ ${br(usd * cambio)})` : "");
    console.log(
      `Evals com a IA: ${casos.length} caso(s), até ${est.chamadas} chamadas à API ` +
        `(${LLM_ROUTES.analise_pedido.model}).`,
    );
    console.log(
      `Custo estimado: US$ ${br(est.min)} a US$ ${br(est.max)}${reais(est.max)}, ` +
        `com os preços conferidos em ${PRICING_CHECKED_ON} (confira em anthropic.com/pricing).`,
    );
    if (!semPerguntar && !(await confirm("Continuar? (s/N) "))) {
      console.log("Cancelado. Nada foi gasto.");
      return;
    }
    // O custo real também fica no banco local (uso_api), como no app.
    registro = { db: getDb(), cambioBrl: cambio ?? 0 };
    const base = llmAnalyzer(registro, (u) => usos.push(u));
    // Uma análise por pedido: as etapas (respostas clicadas) reaproveitam, como no app.
    const memoria = new Map<string, Promise<Analysis>>();
    analisar = (pedido) => {
      const atual = memoria.get(pedido) ?? base(pedido);
      memoria.set(pedido, atual);
      return atual;
    };
  }

  const relatorios: Array<CaseReport & { explicacao?: unknown }> = [];
  for (const caso of casos) {
    const r = await runEvalCase(caso, { loaded, analisar }, ctx);
    let extra: string | undefined;
    let explicacao: unknown;
    if (!simples) {
      // A explicação da escolha (sem números): só informativa, não reprova o caso.
      const primeira = await runPipeline(
        { pedido: caso.pedido, respostas: {} },
        { loaded, analisar },
      );
      if (primeira.tipo === "opcoes") {
        explicacao = await explainChoice(primeira, { registro, aoUsar: (u) => usos.push(u) });
        const origem = (explicacao as { origem: string }).origem;
        extra =
          origem === "ia"
            ? "Explicação da IA aceita (sem números)."
            : "Explicação da IA recusada (tinha número ou falhou): ficaram os motivos das regras.";
      }
    }
    printCase(r, extra);
    relatorios.push({ ...r, explicacao });
  }

  const passaram = relatorios.filter((r) => r.ok).length;
  const custo = usos.reduce((s, u) => s + u.custo_usd, 0);
  console.log(
    `\n${passaram}/${relatorios.length} casos passaram${simples ? " (modo simples)" : ""}.`,
  );
  if (!simples) {
    console.log(
      `Custo real: US$ ${br(custo, 4)} em ${usos.length} chamadas` +
        (cambio ? ` (R$ ${br(custo * cambio)}).` : "."),
    );
  }

  const pasta = path.join("data", "local", "evals");
  mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(
    pasta,
    `evals-${simples ? "simples" : "ia"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(
    arquivo,
    JSON.stringify(
      { modo: simples ? "simples" : "ia", custo_usd: custo, usos, relatorios },
      null,
      2,
    ),
  );
  console.log(`Relatório completo: ${arquivo}`);
  if (passaram < relatorios.length) process.exitCode = 1;
}

void main();
