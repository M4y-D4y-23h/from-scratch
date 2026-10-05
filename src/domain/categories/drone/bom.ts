import { type SearchLink, searchLink } from "@/domain/core/search-links";
import type { Source } from "@/domain/core/source";
import type { VerificationStatus } from "@/domain/core/verification";

import { type Build, GROUND_CATEGORIES } from "./build";
import type { CostLine, CostReport } from "./costs";
import type { Archetype, ComponentCategory, WhereToBuy } from "./schema";

/*
 * Lista de peças (BOM) da aba "Peças e Custos" (SPEC B.12): agrupada por função, com quantidade,
 * custo, selo e onde procurar. Só organiza o que o build e o custo já calcularam.
 */

export const BOM_GROUPS = [
  "estrutura",
  "propulsao",
  "eletronica",
  "radio_video",
  "energia",
] as const;
export type BomGroup = (typeof BOM_GROUPS)[number];

export const BOM_GROUP_LABEL: Record<BomGroup, string> = {
  estrutura: "Estrutura",
  propulsao: "Propulsão",
  eletronica: "Eletrônica",
  radio_video: "Rádio e vídeo",
  energia: "Energia",
};

/** Grupo de cada categoria de peça. O tipo exige todas: categoria nova sem grupo não compila. */
export const CATEGORY_GROUP: Record<ComponentCategory, BomGroup> = {
  frame: "estrutura",
  kit: "estrutura",
  acessorio: "estrutura",
  mastro_gps: "estrutura",
  parafuso: "estrutura",
  strap: "estrutura",
  motor: "propulsao",
  helice: "propulsao",
  esc: "propulsao",
  esc_4em1: "propulsao",
  fc: "eletronica",
  stack: "eletronica",
  fc_aio: "eletronica",
  gps: "eletronica",
  telemetria: "eletronica",
  buzzer: "eletronica",
  cabo: "eletronica",
  receptor: "radio_video",
  radio_tx: "radio_video",
  vtx: "radio_video",
  camera_fpv: "radio_video",
  antena: "radio_video",
  receptor_video: "radio_video",
  oculos_fpv: "radio_video",
  camera_acao: "radio_video",
  bateria: "energia",
  bateria_radio: "energia",
  carregador: "energia",
  fonte: "energia",
  modulo_energia: "energia",
  conector: "energia",
  consumivel: "energia",
};

export const WHERE_TO_BUY_LABEL: Record<WhereToBuy["tipo_loja"], string> = {
  marketplace_nacional: "lojas on-line do Brasil",
  importacao: "importação",
  loja_hobby_robotica: "lojas de hobby e robótica",
  loja_ferramentas: "lojas de ferramentas",
  fabricante: "loja do fabricante",
};

/** Onde procurar uma peça: o tipo de loja, o termo e os links de busca (quando há um site). */
export type PurchaseOption = {
  tipo_loja: WhereToBuy["tipo_loja"];
  rotulo: string;
  termo_busca: string;
  observacao?: string;
  links: SearchLink[];
};

/**
 * Lojas brasileiras de hobby/robótica e a loja do fabricante aparecem como TIPO de loja, com o
 * termo para procurar (SPEC B.12): não existe uma busca única para elas, e link de anúncio
 * específico é proibido (SPEC B.1.6).
 */
export function purchaseOptions(onde: readonly WhereToBuy[]): PurchaseOption[] {
  return onde.map((w) => {
    const links: SearchLink[] = [];
    if (w.tipo_loja === "marketplace_nacional" || w.tipo_loja === "loja_ferramentas") {
      links.push(searchLink("mercado_livre", w.termo_busca));
    }
    if (w.tipo_loja === "importacao") links.push(searchLink("aliexpress", w.termo_busca));
    return {
      tipo_loja: w.tipo_loja,
      rotulo: WHERE_TO_BUY_LABEL[w.tipo_loja],
      termo_busca: w.termo_busca,
      observacao: w.observacao,
      links,
    };
  });
}

/** Nome de um slot para a interface: o rótulo do catálogo ou o id legível. */
export function slotLabel(archetype: Pick<Archetype, "slots">, slot: string): string {
  if (slot.startsWith("kit:")) return "Kit";
  const rotulo = archetype.slots.find((s) => s.slot === slot)?.rotulo;
  if (rotulo) return rotulo;
  const texto = slot.replace(/_/g, " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export type BomRow = {
  slot: string;
  rotulo: string;
  grupo: BomGroup;
  componente_id: string;
  nome: string;
  categoria: ComponentCategory;
  descricao_leiga: string;
  selo: VerificationStatus;
  quantidade_no_drone: number;
  quantidade_compra: number;
  unidades_por_pacote: number;
  /** Linha de custo (faixa, origem, pacotes, imposto). */
  custo?: CostLine;
  /** Produto em cuja caixa a peça vem (kit ARF, VTX com antena...). */
  vem_com?: { id: string; nome: string };
  /** Kits: o que vem na caixa. */
  conteudo: Array<{ id: string; nome: string; quantidade: number }>;
  /** A peça voa (aparece no 3D e no peso). */
  voa: boolean;
  massa_g?: number;
  massa_estimada: boolean;
  onde_comprar: PurchaseOption[];
  fontes: Source[];
  notas_seguranca: string[];
};

export type BomGroupRows = { grupo: BomGroup; rotulo: string; linhas: BomRow[] };

const nameOf = (c: { marca: string; modelo: string }) => `${c.marca} ${c.modelo}`;

export function bomRows(build: Build, archetype: Archetype, custos: CostReport): BomRow[] {
  const custoDe = new Map(custos.pecas.map((l) => [l.id, l]));
  const porId = new Map(build.itens.map((i) => [i.componente.id, i.componente]));
  const ordemSlot = new Map(archetype.slots.map((s, i) => [s.slot, i]));
  return build.itens
    .map((item) => {
      const c = item.componente;
      const dono = item.fornecido_por ? porId.get(item.fornecido_por) : undefined;
      return {
        slot: item.slot,
        rotulo: slotLabel(archetype, item.slot),
        grupo: CATEGORY_GROUP[c.categoria],
        componente_id: c.id,
        nome: nameOf(c),
        categoria: c.categoria,
        descricao_leiga: c.descricao_leiga,
        selo: c.status_verificacao,
        quantidade_no_drone: item.quantidade_no_drone,
        quantidade_compra: item.quantidade_compra,
        unidades_por_pacote: c.unidades_por_pacote,
        custo: custoDe.get(c.id),
        vem_com: item.fornecido_por
          ? { id: item.fornecido_por, nome: dono ? nameOf(dono) : item.fornecido_por }
          : undefined,
        conteudo: c.inclui.map((inc) => {
          const peca = porId.get(inc.componente_id);
          return {
            id: inc.componente_id,
            nome: peca ? nameOf(peca) : inc.componente_id,
            quantidade: inc.quantidade,
          };
        }),
        voa: item.quantidade_no_drone > 0 && !GROUND_CATEGORIES.has(c.categoria),
        massa_g: c.massa_g ?? c.massa_estimada_g?.valor,
        massa_estimada: c.massa_g === undefined && c.massa_estimada_g !== undefined,
        onde_comprar: purchaseOptions(c.onde_comprar),
        fontes: c.fontes,
        notas_seguranca: c.notas_seguranca,
      };
    })
    .sort(
      (a, b) =>
        BOM_GROUPS.indexOf(a.grupo) - BOM_GROUPS.indexOf(b.grupo) ||
        (ordemSlot.get(a.slot) ?? 99) - (ordemSlot.get(b.slot) ?? 99),
    );
}

/** As linhas da BOM separadas por grupo, na ordem da SPEC (grupos vazios ficam de fora). */
export function groupBom(rows: readonly BomRow[]): BomGroupRows[] {
  return BOM_GROUPS.map((grupo) => ({
    grupo,
    rotulo: BOM_GROUP_LABEL[grupo],
    linhas: rows.filter((r) => r.grupo === grupo),
  })).filter((g) => g.linhas.length > 0);
}
