import { z } from "zod";

import { importParamsSchema } from "@/domain/core/importacao";
import type { Source } from "@/domain/core/source";

import { TELEMETRY_OPTIONS } from "./build";
import {
  archetypeSchema,
  type Component,
  type ComponentCategory,
  componentSchema,
  firmwareProfileSchema,
  readyMadeSchema,
  type ThrustData,
  thrustDataSchema,
  toolSchema,
  type WhereToBuy,
} from "./schema";

/*
 * O catálogo curado inteiro de drones (SPEC B.6). A fonte da verdade são os arquivos JSON em
 * data/catalog/drone (versionados no git); o servidor lê os arquivos e entrega o conteúdo aqui.
 * Este módulo só valida: formato (zod) e coerência entre os itens (checkCatalog).
 */

export const droneCatalogSchema = z.object({
  componentes: z.array(componentSchema),
  empuxo: z.array(thrustDataSchema),
  ferramentas: z.array(toolSchema),
  arquetipos: z.array(archetypeSchema),
  perfis_firmware: z.array(firmwareProfileSchema),
  /** Drones prontos de referência, para comparar montar × comprar pronto. */
  prontos: z.array(readyMadeSchema).default([]),
  /** Parâmetros de importação (câmbio, tributos) para converter preços em US$. */
  importacao: importParamsSchema.optional(),
});
export type DroneCatalog = z.infer<typeof droneCatalogSchema>;

/** Todas as categorias de peça aceitas pelo schema (para conferir slots e passos). */
export const COMPONENT_CATEGORIES: ReadonlySet<string> = new Set(
  componentSchema.options.map((o) => o.shape.categoria.value),
);

/**
 * Itens genéricos e baratos (conector, cabo, parafuso...) cujo preço varia de loja para loja e
 * não tem página oficial: podem ficar sem preço. O custo do projeto lista cada um como "sem preço
 * pesquisado" em vez de inventar um valor (SPEC B.1.2).
 */
export const GENERIC_CATEGORIES: ReadonlySet<ComponentCategory> = new Set<ComponentCategory>([
  "conector",
  "cabo",
  "parafuso",
  "strap",
  "consumivel",
]);

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dup.add(id);
    seen.add(id);
  }
  return [...dup];
}

/** Item marcado como ✅ precisa de pelo menos uma fonte com link e data de acesso. */
function hasCheckableSource(fontes: readonly Source[]): boolean {
  return fontes.some((f) => f.url !== undefined && f.acessado_em !== undefined);
}

function checkSources(onde: string, fontes: readonly Source[], problemas: string[]) {
  for (const f of fontes) {
    if (f.url !== undefined && !f.url.startsWith("https://")) {
      problemas.push(`${onde}: fonte "${f.titulo}" sem https`);
    }
  }
}

/** Onde comprar é sempre termo de busca, nunca link de anúncio (SPEC B.1.6). */
function checkWhereToBuy(onde: string, lista: readonly WhereToBuy[], problemas: string[]) {
  for (const w of lista) {
    if (/https?:\/\/|www\./i.test(w.termo_busca)) {
      problemas.push(`${onde}: termo de busca "${w.termo_busca}" parece um link`);
    }
  }
}

function checkThrustTable(
  t: ThrustData,
  byId: ReadonlyMap<string, Component>,
  problemas: string[],
) {
  const onde = `empuxo ${t.id}`;
  const motor = byId.get(t.motor_id);
  const prop = byId.get(t.helice_id);
  if (motor?.categoria !== "motor") problemas.push(`${onde}: motor_id "${t.motor_id}" não existe`);
  if (prop?.categoria !== "helice")
    problemas.push(`${onde}: helice_id "${t.helice_id}" não existe`);
  if (motor?.categoria === "motor") {
    const { celulas_min: min, celulas_max: max } = motor.specs;
    if ((min !== undefined && t.celulas < min) || (max !== undefined && t.celulas > max)) {
      problemas.push(`${onde}: ${t.celulas}S fora da faixa do motor`);
    }
  }
  const pontos = [...t.pontos].sort((a, b) => a.throttle_pct - b.throttle_pct);
  if (duplicates(pontos.map((p) => String(p.throttle_pct))).length > 0) {
    problemas.push(`${onde}: throttle repetido`);
  }
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1];
    const b = pontos[i];
    if (!a || !b) continue;
    // Mais acelerador nunca dá menos empuxo nem menos corrente: se der, é erro de digitação.
    if (b.empuxo_g < a.empuxo_g || b.corrente_a < a.corrente_a) {
      problemas.push(
        `${onde}: empuxo/corrente diminui entre ${a.throttle_pct}% e ${b.throttle_pct}%`,
      );
    }
  }
  if (t.status_verificacao === "verificado" && !hasCheckableSource(t.fontes)) {
    problemas.push(`${onde}: marcado como verificado sem fonte com link e data`);
  }
  checkSources(onde, t.fontes, problemas);
}

export type CheckOptions = {
  /** Ids de alertas definidos fora dos arquétipos (alertas globais de segurança). */
  alertasGlobais?: readonly string[];
};

/**
 * Coerência do catálogo: ids únicos, referências que existem, tabelas de empuxo plausíveis e
 * honestidade dos selos. Devolve a lista de problemas (vazia = tudo certo).
 */
export function checkCatalog(catalog: DroneCatalog, options: CheckOptions = {}): string[] {
  const problemas: string[] = [];
  const byId = new Map(catalog.componentes.map((c) => [c.id, c]));
  const toolIds = new Set(catalog.ferramentas.map((t) => t.id));
  const profileIds = new Set(catalog.perfis_firmware.map((p) => p.id));

  for (const [tipo, ids] of [
    ["componente", catalog.componentes.map((c) => c.id)],
    ["tabela de empuxo", catalog.empuxo.map((t) => t.id)],
    ["ferramenta", catalog.ferramentas.map((t) => t.id)],
    ["arquétipo", catalog.arquetipos.map((a) => a.id)],
    ["perfil de firmware", catalog.perfis_firmware.map((p) => p.id)],
    ["drone pronto", catalog.prontos.map((p) => p.id)],
  ] as const) {
    for (const id of duplicates(ids)) problemas.push(`${tipo} com id repetido: ${id}`);
  }

  for (const c of catalog.componentes) {
    const onde = `componente ${c.id}`;
    if (c.status_verificacao === "verificado" && !hasCheckableSource(c.fontes)) {
      problemas.push(`${onde}: marcado como verificado sem fonte com link e data`);
    }
    const brl = c.preco_estimado_brl;
    const usd = c.preco_referencia_usd;
    if (!brl && !usd && c.vendido_separadamente && !GENERIC_CATEGORIES.has(c.categoria)) {
      problemas.push(`${onde}: sem preço (em R$ ou em US$)`);
    }
    for (const inc of c.inclui) {
      if (!byId.has(inc.componente_id)) {
        problemas.push(`${onde}: inclui "${inc.componente_id}", que não existe`);
      }
    }
    // A química define a tensão de carga (LiHV 4,35 V por célula) e ajustes do firmware.
    if (c.categoria === "bateria" && !c.specs.quimica) {
      problemas.push(`${onde}: bateria sem química (LiPo, LiHV ou Li-ion)`);
    }
    if (brl?.status === "verificado" && !hasCheckableSource(brl.fontes)) {
      problemas.push(`${onde}: preço verificado sem fonte com link e data`);
    }
    checkSources(onde, [...c.fontes, ...(brl?.fontes ?? []), ...(usd?.fontes ?? [])], problemas);
    checkWhereToBuy(onde, c.onde_comprar, problemas);
  }

  // Peça que só vem dentro de outro produto precisa estar na caixa de algum.
  const incluidos = new Set(
    catalog.componentes.flatMap((c) => c.inclui.map((i) => i.componente_id)),
  );
  for (const c of catalog.componentes) {
    if (!c.vendido_separadamente && !incluidos.has(c.id)) {
      problemas.push(
        `componente ${c.id}: não é vendido separadamente, mas nenhum produto o inclui`,
      );
    }
  }

  for (const r of catalog.prontos) {
    const onde = `drone pronto ${r.id}`;
    if (!catalog.arquetipos.some((a) => a.id === r.arquetipo_id)) {
      problemas.push(`${onde}: arquétipo "${r.arquetipo_id}" não existe`);
    }
    for (const cat of r.cobre_categorias) {
      if (!COMPONENT_CATEGORIES.has(cat)) problemas.push(`${onde}: categoria "${cat}" não existe`);
    }
    if (!r.preco_estimado_brl && !r.preco_referencia_usd) {
      problemas.push(`${onde}: sem preço (em R$ ou em US$)`);
    }
    if (r.status_verificacao === "verificado" && !hasCheckableSource(r.fontes)) {
      problemas.push(`${onde}: marcado como verificado sem fonte com link e data`);
    }
    checkSources(onde, [...r.fontes, ...(r.preco_referencia_usd?.fontes ?? [])], problemas);
    checkWhereToBuy(onde, r.onde_comprar, problemas);
  }

  if (
    !catalog.importacao &&
    [...catalog.componentes, ...catalog.prontos].some((c) => c.preco_referencia_usd)
  ) {
    problemas.push("há preços em US$, mas falta parametros/importacao.json para converter em R$");
  }

  for (const t of catalog.empuxo) checkThrustTable(t, byId, problemas);

  const archetypeIds = new Set(catalog.arquetipos.map((a) => a.id));
  for (const t of catalog.ferramentas) {
    for (const a of t.arquetipos) {
      if (!archetypeIds.has(a)) problemas.push(`ferramenta ${t.id}: arquétipo "${a}" não existe`);
    }
    checkSources(`ferramenta ${t.id}`, t.fontes, problemas);
    checkWhereToBuy(`ferramenta ${t.id}`, t.onde_comprar, problemas);
  }

  for (const p of catalog.perfis_firmware) {
    for (const nome of duplicates(p.parametros.map((x) => x.nome))) {
      // O mesmo parâmetro pode aparecer com condições diferentes (ex.: por tipo de telemetria).
      const semCondicao = p.parametros.filter((x) => x.nome === nome && !x.condicao);
      if (semCondicao.length > 1) problemas.push(`perfil ${p.id}: parâmetro ${nome} repetido`);
    }
  }

  for (const a of catalog.arquetipos) {
    const onde = `arquétipo ${a.id}`;
    if (a.perfil_firmware && !profileIds.has(a.perfil_firmware)) {
      problemas.push(`${onde}: perfil de firmware "${a.perfil_firmware}" não existe`);
    }
    const slotNames = a.slots.map((s) => s.slot);
    for (const id of duplicates(slotNames)) problemas.push(`${onde}: slot repetido: ${id}`);
    for (const s of a.slots) {
      for (const cat of s.categorias) {
        if (!COMPONENT_CATEGORIES.has(cat))
          problemas.push(`${onde}: slot ${s.slot}: categoria "${cat}" não existe`);
      }
      for (const other of s.coberto_por) {
        if (!slotNames.includes(other))
          problemas.push(`${onde}: slot ${s.slot}: coberto_por "${other}" não existe`);
      }
    }
    const alertIds = new Set([...a.alertas.map((x) => x.id), ...(options.alertasGlobais ?? [])]);
    for (const id of duplicates(a.passos.map((p) => p.id)))
      problemas.push(`${onde}: passo repetido: ${id}`);
    for (const passo of a.passos) {
      const op = `${onde}, passo ${passo.id}`;
      for (const f of passo.ferramentas) {
        if (!toolIds.has(f)) problemas.push(`${op}: ferramenta "${f}" não existe`);
      }
      for (const cat of [
        ...passo.pecas,
        ...(passo.condicao?.tem_categoria ?? []),
        ...(passo.condicao?.sem_categoria ?? []),
      ]) {
        if (!COMPONENT_CATEGORIES.has(cat)) problemas.push(`${op}: categoria "${cat}" não existe`);
      }
      for (const tel of passo.condicao?.telemetria ?? []) {
        if (!(TELEMETRY_OPTIONS as readonly string[]).includes(tel)) {
          problemas.push(`${op}: opção de telemetria "${tel}" não existe`);
        }
      }
      for (const al of passo.alertas) {
        if (!alertIds.has(al)) problemas.push(`${op}: alerta "${al}" não existe`);
      }
      checkSources(op, passo.fontes, problemas);
    }
    checkSources(onde, a.fontes, problemas);
  }
  return problemas;
}

/** Peças do catálogo de uma categoria. */
export function componentsOf<C extends ComponentCategory>(
  catalog: DroneCatalog,
  categoria: C,
): Array<Extract<Component, { categoria: C }>> {
  return catalog.componentes.filter(
    (c): c is Extract<Component, { categoria: C }> => c.categoria === categoria,
  );
}
