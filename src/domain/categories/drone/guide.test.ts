import { describe, expect, it } from "vitest";

import { canConfirmCheckpoint, canMarkDone, guideState, type StepProgress } from "./guide";
import type { BuildStepTemplate } from "./schema";

/* Regras do guia com passos sintéticos (o catálogo real fica em tests/unit/guide-reference). */

function passo(id: string, extra: Partial<BuildStepTemplate> = {}): BuildStepTemplate {
  return {
    id,
    titulo: `Passo ${id}`,
    objetivo: "x",
    por_que_importa: "x",
    pecas: [],
    ferramentas: [],
    tempo_min: [10, 20],
    dominios: {},
    riscos: [],
    como_saber_que_deu_certo: ["x"],
    erros_comuns: [],
    local: "em_casa",
    alertas: [],
    variaveis: [],
    opcional: false,
    fontes: [],
    ...extra,
  };
}

const checklist = { bloqueante: true as const, itens: ["Sem hélices.", "Antena instalada."] };
const PASSOS = [
  passo("a"),
  passo("ligar", { checkpoint: checklist }),
  passo("b"),
  passo("helices", { checkpoint: { bloqueante: true, itens: ["Sentido conferido."] } }),
  passo("extra", { opcional: true, tempo_min: [60, 120] }),
  passo("voar"),
];
const feito = (id: string, confirmado = false): StepProgress => ({
  passo_id: id,
  status: "feito",
  checkpoint_confirmado_em: confirmado ? "2026-10-08T10:00:00.000Z" : undefined,
});

describe("estado do guia", () => {
  it("começa no primeiro passo, com o tempo de tudo o que é obrigatório", () => {
    const e = guideState(PASSOS, []);
    expect(e).toMatchObject({ obrigatorios: 5, feitos: 0, percentual: 0, atual: "a" });
    expect(e.concluido).toBe(false);
    // O passo opcional não conta no tempo nem no total.
    expect(e.tempo_restante_min).toEqual([50, 100]);
  });

  it("passos depois de um checklist pendente ficam bloqueados", () => {
    const e = guideState(PASSOS, [feito("a")]);
    expect(e.passos.ligar?.bloqueado_por).toBeUndefined();
    expect(e.passos.b?.bloqueado_por).toBe("ligar");
    expect(e.passos.helices?.bloqueado_por).toBe("ligar");
    expect(e.atual).toBe("ligar");
  });

  it("concluído quando todos os obrigatórios estão feitos (o opcional não precisa)", () => {
    const tudo = ["a", "ligar", "b", "helices", "voar"].map((id) => feito(id, true));
    const e = guideState(PASSOS, tudo);
    expect(e).toMatchObject({ feitos: 5, percentual: 100, concluido: true, atual: undefined });
    expect(e.tempo_restante_min).toEqual([0, 0]);
  });

  it("progresso de passos que não existem mais (troca de peça) é ignorado", () => {
    expect(guideState(PASSOS, [feito("sumiu")]).feitos).toBe(0);
  });
});

describe("checkpoints de segurança (SPEC B.9)", () => {
  it("o checklist só é confirmado com todos os itens", () => {
    expect(canConfirmCheckpoint("ligar", ["Sem hélices."], PASSOS, [])).toMatchObject({
      ok: false,
    });
    expect(canConfirmCheckpoint("ligar", checklist.itens, PASSOS, [])).toEqual({ ok: true });
    expect(canConfirmCheckpoint("a", [], PASSOS, [])).toMatchObject({ ok: false });
  });

  it("passo com checklist só é marcado como feito depois de confirmar", () => {
    expect(canMarkDone("ligar", PASSOS, [])).toMatchObject({
      ok: false,
      motivo: expect.stringContaining("Confirme o checklist"),
    });
    const confirmado: StepProgress = {
      passo_id: "ligar",
      status: "pendente",
      checkpoint_confirmado_em: "2026-10-08T10:00:00.000Z",
    };
    expect(canMarkDone("ligar", PASSOS, [confirmado])).toEqual({ ok: true });
  });

  it("não dá para pular um passo crítico", () => {
    const r = canMarkDone("voar", PASSOS, []);
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining("passo 2") });
    // Nem confirmar o checklist das hélices antes da primeira ligação.
    expect(canConfirmCheckpoint("helices", ["Sentido conferido."], PASSOS, [])).toMatchObject({
      ok: false,
    });
    // Passos antes do primeiro checklist: livres, em qualquer ordem.
    expect(canMarkDone("a", PASSOS, [])).toEqual({ ok: true });
  });

  it("passo que não está no guia é recusado", () => {
    expect(canMarkDone("inventado", PASSOS, [])).toMatchObject({ ok: false });
  });
});
