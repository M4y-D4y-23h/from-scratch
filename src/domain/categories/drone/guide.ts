import type { SafetyAlert } from "../../core/safety";
import type { Build } from "./build";
import type { ResolvedParam } from "./firmware";
import type { BuildStepTemplate } from "./schema";

/*
 * Guia de montagem (SPEC B.13): os passos do arquétipo que valem para este build, cada um com as
 * peças, ferramentas, parâmetros do firmware e alertas DO PROJETO, e o estado do progresso.
 *
 * Checkpoints de segurança (SPEC B.9): antes de um passo crítico (primeira ligação, hélices,
 * primeiro voo...), a pessoa confirma o checklist inteiro; só então o passo pode ser marcado como
 * feito. E nenhum passo depois de um passo com checklist pendente pode ser marcado como feito:
 * os passos críticos são portões (quem pula a primeira ligação sem hélices e vai configurar os
 * motores pode se cortar). Os outros passos podem ser feitos em qualquer ordem.
 *
 * Puro: o servidor usa para validar as ações e o navegador, para montar a tela.
 */

export type StepStatus = "pendente" | "feito";

/** Progresso salvo de um passo (datas em ISO). */
export type StepProgress = {
  passo_id: string;
  status: StepStatus;
  checkpoint_confirmado_em?: string;
};

export type GuidePart = { id: string; nome: string; quantidade: number };
export type GuideTool = { id: string; nome: string };
export type GuideParam = Pick<ResolvedParam, "nome"> &
  Partial<Pick<ResolvedParam, "unidade" | "explicacao">> & {
    /** Ausente = depende de um dado que falta no catálogo. */
    valor?: number | string;
  };

export type GuideStep = BuildStepTemplate & {
  /** Posição no guia (1, 2, 3...). */
  numero: number;
  /** As peças deste build nas categorias do passo (o que destacar no 3D). */
  pecas_do_build: GuidePart[];
  ferramentas_do_passo: GuideTool[];
  parametros_do_passo: GuideParam[];
  alertas_do_passo: SafetyAlert[];
};

/** Monta o guia a partir do relatório do projeto (sem recalcular nada). */
export function buildGuide(input: {
  passos: readonly BuildStepTemplate[];
  build: Build;
  parametros: readonly ResolvedParam[];
  alertas: readonly SafetyAlert[];
  ferramentas: readonly GuideTool[];
}): GuideStep[] {
  const parametros = new Map(input.parametros.map((p) => [p.nome, p]));
  const alertas = new Map(input.alertas.map((a) => [a.id, a]));
  const ferramentas = new Map(input.ferramentas.map((t) => [t.id, t]));
  return input.passos.map((passo, i) => ({
    ...passo,
    numero: i + 1,
    pecas_do_build: input.build.itens
      .filter((item) => passo.pecas.includes(item.componente.categoria))
      .map((item) => ({
        id: item.componente.id,
        nome: `${item.componente.marca} ${item.componente.modelo}`,
        quantidade: item.quantidade_no_drone,
      })),
    // Ferramenta fora da lista do projeto (não se aplica a este build) não aparece.
    ferramentas_do_passo: passo.ferramentas.flatMap((id) => {
      const t = ferramentas.get(id);
      return t ? [t] : [];
    }),
    parametros_do_passo: passo.variaveis.map((nome) => {
      const p = parametros.get(nome);
      return p ? { nome, valor: p.valor, unidade: p.unidade, explicacao: p.explicacao } : { nome };
    }),
    // Só os alertas que valem para este projeto (os condicionais já foram filtrados).
    alertas_do_passo: passo.alertas.flatMap((id) => {
      const a = alertas.get(id);
      return a ? [a] : [];
    }),
  }));
}

export type StepState = {
  feito: boolean;
  checkpoint_confirmado: boolean;
  /** Passo com checklist, antes deste, que ainda não foi feito (impede marcar este). */
  bloqueado_por?: string;
};

export type GuideState = {
  passos: Record<string, StepState>;
  /** Passos que contam para terminar o guia (os opcionais não contam). */
  obrigatorios: number;
  feitos: number;
  percentual: number;
  /** O primeiro passo obrigatório ainda não feito (por onde continuar). */
  atual?: string;
  concluido: boolean;
  /** Tempo dos passos obrigatórios que faltam, em minutos [mínimo, máximo]. */
  tempo_restante_min: [number, number];
};

export function guideState(
  passos: readonly BuildStepTemplate[],
  progresso: readonly StepProgress[],
): GuideState {
  const salvo = new Map(progresso.map((p) => [p.passo_id, p]));
  const estado: Record<string, StepState> = {};
  let portao: string | undefined;
  let obrigatorios = 0;
  let feitos = 0;
  let atual: string | undefined;
  const restante: [number, number] = [0, 0];
  for (const passo of passos) {
    const p = salvo.get(passo.id);
    const feito = p?.status === "feito";
    estado[passo.id] = {
      feito,
      checkpoint_confirmado: Boolean(p?.checkpoint_confirmado_em),
      bloqueado_por: portao,
    };
    if (passo.checkpoint && !feito && portao === undefined) portao = passo.id;
    if (passo.opcional) continue;
    obrigatorios += 1;
    if (feito) {
      feitos += 1;
    } else {
      atual ??= passo.id;
      restante[0] += passo.tempo_min[0];
      restante[1] += passo.tempo_min[1];
    }
  }
  return {
    passos: estado,
    obrigatorios,
    feitos,
    percentual: obrigatorios === 0 ? 100 : Math.round((feitos / obrigatorios) * 100),
    atual,
    concluido: obrigatorios > 0 && feitos === obrigatorios,
    tempo_restante_min: restante,
  };
}

export type GuideCheck = { ok: true } | { ok: false; motivo: string };

function locked(
  passo: BuildStepTemplate,
  passos: readonly BuildStepTemplate[],
  estado: GuideState,
): GuideCheck {
  const porta = estado.passos[passo.id]?.bloqueado_por;
  if (!porta) return { ok: true };
  const antes = passos.find((p) => p.id === porta);
  const numero = passos.findIndex((p) => p.id === porta) + 1;
  return {
    ok: false,
    motivo: `Termine antes o passo ${numero} (${antes?.titulo ?? porta}): ele tem um checklist de segurança.`,
  };
}

/** Confirmar o checklist: todos os itens marcados, e nenhum passo crítico pendente antes. */
export function canConfirmCheckpoint(
  passoId: string,
  marcados: readonly string[],
  passos: readonly BuildStepTemplate[],
  progresso: readonly StepProgress[],
): GuideCheck {
  const passo = passos.find((p) => p.id === passoId);
  if (!passo) return { ok: false, motivo: "Este passo não faz parte do guia deste projeto." };
  if (!passo.checkpoint) return { ok: false, motivo: "Este passo não tem checklist." };
  const faltando = passo.checkpoint.itens.filter((item) => !marcados.includes(item));
  if (faltando.length > 0) {
    return { ok: false, motivo: `Marque todos os itens do checklist (faltam ${faltando.length}).` };
  }
  return locked(passo, passos, guideState(passos, progresso));
}

/** Marcar como feito: checklist confirmado (se houver) e nenhum passo crítico pendente antes. */
export function canMarkDone(
  passoId: string,
  passos: readonly BuildStepTemplate[],
  progresso: readonly StepProgress[],
): GuideCheck {
  const passo = passos.find((p) => p.id === passoId);
  if (!passo) return { ok: false, motivo: "Este passo não faz parte do guia deste projeto." };
  const estado = guideState(passos, progresso);
  const bloqueio = locked(passo, passos, estado);
  if (!bloqueio.ok) return bloqueio;
  if (passo.checkpoint && !estado.passos[passo.id]?.checkpoint_confirmado) {
    return { ok: false, motivo: "Confirme o checklist de segurança antes de marcar como feito." };
  }
  return { ok: true };
}
