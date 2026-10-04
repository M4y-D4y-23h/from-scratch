import { z } from "zod";

/**
 * Domínios de conhecimento (SPEC B.8). Os ids são estáveis; os nomes são o que a UI mostra.
 * Genérico o bastante para outras categorias (robôs, impressão 3D...) reaproveitarem.
 */
export const DIFFICULTY_DOMAINS = [
  "mecanica",
  "eletronica_solda",
  "potencia_lipo",
  "firmware_config",
  "radio_video",
  "fisica_voo",
  "fabricacao_digital",
  "pilotagem_testes",
  "seguranca_regulamentacao",
] as const;
export const difficultyDomainSchema = z.enum(DIFFICULTY_DOMAINS);
export type DifficultyDomain = z.infer<typeof difficultyDomainSchema>;

export const DOMAIN_LABEL: Record<DifficultyDomain, string> = {
  mecanica: "Mecânica e montagem estrutural",
  eletronica_solda: "Eletrônica e solda",
  potencia_lipo: "Elétrica de potência e baterias LiPo",
  firmware_config: "Firmware e configuração",
  radio_video: "Rádio, controle e vídeo",
  fisica_voo: "Física de voo",
  fabricacao_digital: "Fabricação digital (impressão 3D / CAD)",
  pilotagem_testes: "Pilotagem e testes",
  seguranca_regulamentacao: "Segurança e regulamentação",
};

/** Níveis 0–5 (SPEC B.8). */
export const difficultyLevelSchema = z.int().min(0).max(5);
export type DifficultyLevel = 0 | 1 | 2 | 3 | 4 | 5;

export const LEVEL_LABEL: Record<DifficultyLevel, string> = {
  0: "Nenhum conhecimento necessário",
  1: "Seguir instruções com imagens",
  2: "Usar ferramentas básicas com cuidado",
  3: "Diagnosticar problemas comuns",
  4: "Adaptar e modificar",
  5: "Projetar do zero",
};

export const DIFFICULTY_LABELS = [
  "Iniciante",
  "Intermediário",
  "Avançado",
  "Especialista",
] as const;
export type DifficultyLabel = (typeof DIFFICULTY_LABELS)[number];

/** Faixa de horas [mínimo, máximo]. */
export type HoursRange = readonly [number, number];
