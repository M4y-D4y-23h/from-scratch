/*
 * Mostra no terminal os builds de referência (3 arquétipos × 3 faixas) que o motor de cálculo gera
 * com o catálogo atual: peças, números, custos, dificuldade, regras, alertas e montar × pronto.
 * Uso:
 *   pnpm report                 todos os arquétipos
 *   pnpm report a3              só os arquétipos cujo id começa com "a3"
 *   pnpm report a1 --detalhes   com o motivo de cada escolha e a explicação técnica das regras
 */
import { DEFAULT_DRONE_CONFIG } from "@/domain/categories/drone/config";
import { loadDroneCatalog } from "@/server/catalog/load";
import { phase1Report } from "@/server/report/phase1";

const args = process.argv.slice(2);
const detalhes = args.includes("--detalhes");
const filtro = args.find((a) => !a.startsWith("--"));

const { catalog } = loadDroneCatalog();
console.log(phase1Report(catalog, DEFAULT_DRONE_CONFIG, { filtro, detalhes }));
