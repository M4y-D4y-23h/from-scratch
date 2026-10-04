import type { Source } from "./source";
import type { VerificationStatus } from "./verification";

/** Resultado de uma regra (SPEC B.7): passou, falhou ou não há dado para decidir. */
export type RuleStatus = "passou" | "falhou" | "sem_dado";

/**
 * O que uma falha significa:
 * - bloqueante: o projeto não deve ser montado assim (não voaria com segurança, peça não encaixa...).
 * - alerta: dá para montar, mas há um risco ou uma piora que o usuário precisa conhecer.
 */
export type RuleSeverity = "bloqueante" | "alerta";

export type RuleValue = number | string | boolean;

export type RuleResult = {
  /** Identificador estável da regra (ex.: "esc_corrente"). */
  regra_id: string;
  /** Título curto, em linguagem leiga. */
  titulo: string;
  status: RuleStatus;
  severidade: RuleSeverity;
  /** Confiança nos dados usados pela regra (herdada das peças e cálculos envolvidos). */
  selo: VerificationStatus;
  explicacao_leiga: string;
  explicacao_tecnica: string;
  /** Como corrigir; presente quando falhou ou faltou dado. */
  sugestao?: string;
  /** Números usados na decisão, para a UI mostrar a conta. */
  valores?: Record<string, RuleValue>;
  /** Peças envolvidas (ids do catálogo), para destacar no 3D e na lista. */
  componentes?: string[];
  fontes?: Source[];
};

export type ValidationReport = {
  resultados: RuleResult[];
  /** true se alguma regra bloqueante falhou: o projeto não deve ser montado assim. */
  bloqueado: boolean;
  /** true se alguma regra bloqueante ficou sem dado: o app não pode afirmar que é seguro. */
  incompleto: boolean;
  contagem: Record<RuleStatus, number>;
};

export function buildReport(resultados: readonly RuleResult[]): ValidationReport {
  const contagem: Record<RuleStatus, number> = { passou: 0, falhou: 0, sem_dado: 0 };
  let bloqueado = false;
  let incompleto = false;
  for (const r of resultados) {
    contagem[r.status] += 1;
    if (r.severidade === "bloqueante" && r.status === "falhou") bloqueado = true;
    if (r.severidade === "bloqueante" && r.status === "sem_dado") incompleto = true;
  }
  return { resultados: [...resultados], bloqueado, incompleto, contagem };
}
