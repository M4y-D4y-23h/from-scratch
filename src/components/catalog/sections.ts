import { Gauge, Package, Plane, Wrench } from "lucide-react";

/*
 * As abas do /catalogo (SPEC B.6). Módulo comum ao servidor (que lê a aba do endereço) e ao
 * navegador (que desenha as abas).
 */

export const SECOES = [
  { id: "componentes", rotulo: "Peças", Icon: Package, tipoItem: "componente" },
  { id: "prontos", rotulo: "Drones prontos", Icon: Plane, tipoItem: "pronto" },
  { id: "ferramentas", rotulo: "Ferramentas e EPI", Icon: Wrench, tipoItem: "ferramenta" },
  { id: "empuxo", rotulo: "Tabelas de empuxo", Icon: Gauge, tipoItem: "empuxo" },
] as const;

export type SecaoId = (typeof SECOES)[number]["id"];

export function isSecao(v: string): v is SecaoId {
  return SECOES.some((s) => s.id === v);
}

export type CatalogFilters = {
  secao: SecaoId;
  q: string;
  categoria: string;
  selo: string;
  arquetipo: string;
};
