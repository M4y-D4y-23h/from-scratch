/*
 * Ids das abas da página do projeto (SPEC B.12). Fica fora dos componentes do navegador para o
 * servidor também poder usar (ex.: ler ?aba= do endereço).
 */

export const TABS = [
  "pecas",
  "dificuldade",
  "locais",
  "montagem",
  "seguranca",
  "calculos",
] as const;
export type TabId = (typeof TABS)[number];

export function isTab(value: unknown): value is TabId {
  return typeof value === "string" && (TABS as readonly string[]).includes(value);
}
