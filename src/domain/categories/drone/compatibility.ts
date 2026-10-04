import type { Source } from "@/domain/core/source";
import {
  buildReport,
  type RuleResult,
  type RuleSeverity,
  type ValidationReport,
} from "@/domain/core/validation";
import { deriveStatus, type VerificationStatus } from "@/domain/core/verification";

import { type Build, escOf, fcOf, firstOf, itemsOf, receiverOf } from "./build";
import {
  type AuwResult,
  computeAuw,
  computeFlightTime,
  computePropulsion,
  type FlightTimeResult,
  type PowerPlan,
  planPowerSupply,
  type PropulsionResult,
} from "./calculations";
import type { DroneConfig } from "./config";
import {
  type Archetype,
  type Component,
  type FirmwareProfile,
  mountFits,
  type ThrustData,
} from "./schema";
import { resolveFirmwareParams } from "./firmware";
import { SRC } from "./sources";

/*
 * Regras de compatibilidade e viabilidade (SPEC B.7). Cada regra devolve passou / falhou /
 * sem dado, com explicação leiga, explicação técnica, sugestão e fonte. "Bloqueante" = não montar
 * assim; "alerta" = dá para montar, mas o usuário precisa saber do risco.
 */

/** Remove os ausentes mantendo o tipo de cada peça. */
function present<T>(items: ReadonlyArray<T | undefined>): T[] {
  return items.filter((item): item is T => item !== undefined);
}

export type ValidationContext = {
  build: Build;
  archetype: Archetype;
  thrustTables: readonly ThrustData[];
  config: DroneConfig;
  /** Parâmetros de firmware previstos para o build (Arquétipo 1: ArduCopter 4.7). */
  firmwareProfile?: FirmwareProfile;
};

export type BuildMetrics = {
  auw: AuwResult;
  propulsion: PropulsionResult;
  power: PowerPlan;
  flight: FlightTimeResult;
};

export function computeMetrics(ctx: ValidationContext): BuildMetrics {
  const auw = computeAuw(ctx.build, ctx.config);
  const propulsion = computePropulsion(ctx.build, ctx.thrustTables, auw);
  const power = planPowerSupply(ctx.build, ctx.config);
  const flight = computeFlightTime(ctx.build, propulsion, power, ctx.config);
  return { auw, propulsion, power, flight };
}

type RuleFn = (ctx: ValidationContext, m: BuildMetrics) => RuleResult | null;

type RuleBase = {
  regra_id: string;
  titulo: string;
  severidade: RuleSeverity;
  explicacao_leiga: string;
  componentes?: Component[];
  fontes?: Source[];
};

const sealOf = (
  components: readonly (Component | undefined)[],
  kind: "comparacao" | "estimativa" = "comparacao",
): VerificationStatus =>
  deriveStatus(
    components.map((c) => c?.status_verificacao ?? "nao_verificado"),
    kind,
  );

function result(
  base: RuleBase,
  status: RuleResult["status"],
  detail: {
    tecnica: string;
    sugestao?: string;
    valores?: RuleResult["valores"];
    selo?: VerificationStatus;
  },
): RuleResult {
  return {
    regra_id: base.regra_id,
    titulo: base.titulo,
    status,
    severidade: base.severidade,
    selo: detail.selo ?? sealOf(base.componentes ?? []),
    explicacao_leiga: base.explicacao_leiga,
    explicacao_tecnica: detail.tecnica,
    sugestao: status === "passou" ? undefined : detail.sugestao,
    valores: detail.valores,
    componentes: base.componentes?.map((c) => c.id),
    fontes: base.fontes ?? [SRC.spec],
  };
}

const fmt = (n: number, casas = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
const isArduPilot = (ctx: ValidationContext) => ctx.archetype.firmware === "ArduPilot";

// ---------------------------------------------------------------------------
// Encaixe mecânico
// ---------------------------------------------------------------------------

const propFitsFrame: RuleFn = ({ build }) => {
  const frame = firstOf(build, "frame")?.componente;
  const prop = firstOf(build, "helice")?.componente;
  if (!frame || !prop) return null;
  const base: RuleBase = {
    regra_id: "helice_cabe_no_frame",
    titulo: "A hélice cabe no frame",
    severidade: "bloqueante",
    explicacao_leiga:
      "Cada frame tem um tamanho máximo de hélice. Hélice maior que isso bate no frame ou na hélice vizinha e quebra em voo.",
    componentes: [frame, prop],
  };
  const max = frame.specs.helice_max_pol;
  const d = prop.specs.diametro_pol;
  if (max === undefined || d === undefined) {
    return result(base, "sem_dado", {
      tecnica: "Falta o diâmetro da hélice ou a hélice máxima do frame no catálogo.",
      sugestao: "Confira no datasheet do frame a hélice máxima suportada.",
    });
  }
  return result(base, d <= max ? "passou" : "falhou", {
    tecnica: `Hélice de ${fmt(d)}" no frame que aceita até ${fmt(max)}".`,
    sugestao: `Use hélices de até ${fmt(max)}" ou um frame maior.`,
    valores: { helice_pol: d, helice_max_pol: max },
  });
};

const motorMountsOnFrame: RuleFn = ({ build }) => {
  const frame = firstOf(build, "frame")?.componente;
  const motor = firstOf(build, "motor")?.componente;
  if (!frame || !motor) return null;
  const base: RuleBase = {
    regra_id: "furacao_motor_frame",
    titulo: "O motor parafusa no braço do frame",
    severidade: "bloqueante",
    explicacao_leiga:
      "A base do motor tem furos numa distância certa (a 'furação'). Se não bater com os furos do braço, o motor não fixa com segurança.",
    componentes: [frame, motor],
  };
  const a = frame.specs.furacao_motor;
  const b = motor.specs.furacao;
  if (!a?.length || !b?.length) {
    return result(base, "sem_dado", {
      tecnica: "Falta a furação do motor ou do braço no catálogo.",
      sugestao: "Confira as medidas dos furos (ex.: 16x19 M3) nos datasheets.",
    });
  }
  const ok = b.some((pattern) => mountFits(pattern, a));
  return result(base, ok ? "passou" : "falhou", {
    tecnica: `Motor: ${b.join(", ")}. Braço: ${a.join(", ")}.`,
    sugestao: "Escolha um motor com a mesma furação do braço (ou um frame compatível).",
    valores: { motor: b.join(", "), frame: a.join(", ") },
  });
};

const stackMountsOnFrame: RuleFn = ({ build }) => {
  const frame = firstOf(build, "frame")?.componente;
  const fc = fcOf(build);
  if (!frame || !fc) return null;
  const base: RuleBase = {
    regra_id: "furacao_stack_frame",
    titulo: "A controladora (FC) parafusa no frame",
    severidade: "bloqueante",
    explicacao_leiga:
      "A placa da controladora também tem um padrão de furos (20x20, 30,5x30,5...). O frame precisa ter o mesmo padrão.",
    componentes: [frame, fc.componente],
  };
  // FC do padrão Pixhawk: vai presa com espuma/fita anti-vibração numa placa plana, sem furação.
  if (fc.specs.fixacao_fita && frame.specs.fixacao_fc_fita) {
    return result(base, "passou", {
      tecnica: "FC presa com espuma/fita anti-vibração na placa superior do frame.",
    });
  }
  const a = frame.specs.furacao_stack;
  const b = fc.specs.furacao;
  if (!a?.length || !b?.length) {
    return result(base, "sem_dado", {
      tecnica: "Falta a furação da FC/stack ou do frame no catálogo.",
      sugestao: "Confira a furação (ex.: 30.5x30.5 M3) nos datasheets.",
    });
  }
  const ok = b.some((pattern) => mountFits(pattern, a));
  return result(base, ok ? "passou" : "falhou", {
    tecnica: `FC/stack: ${b.join(", ")}. Frame: ${a.join(", ")}.`,
    sugestao: "Escolha uma FC com a furação do frame ou use um adaptador de furação.",
  });
};

const propMountsOnMotor: RuleFn = ({ build }) => {
  const motor = firstOf(build, "motor")?.componente;
  const prop = firstOf(build, "helice")?.componente;
  if (!motor || !prop) return null;
  const base: RuleBase = {
    regra_id: "helice_encaixa_no_motor",
    titulo: "A hélice encaixa no eixo do motor",
    severidade: "bloqueante",
    explicacao_leiga:
      "Hélices prendem de jeitos diferentes (porca, rosca própria, parafusos, encaixe por pressão). O jeito precisa ser o mesmo do motor.",
    componentes: [motor, prop],
  };
  const mounts = motor.specs.fixacao_helice;
  const mount = prop.specs.fixacao;
  if (!mounts?.length || !mount) {
    return result(base, "sem_dado", {
      tecnica: "Falta o tipo de fixação da hélice ou do motor no catálogo.",
      sugestao: "Confira no datasheet o diâmetro do eixo e o tipo de fixação.",
    });
  }
  return result(base, mounts.includes(mount) ? "passou" : "falhou", {
    tecnica: `Motor aceita: ${mounts.join(", ")}. Hélice: ${mount}.`,
    sugestao: "Escolha hélices com o mesmo tipo de fixação do motor.",
  });
};

// ---------------------------------------------------------------------------
// Energia: células, conectores, correntes
// ---------------------------------------------------------------------------

function cellsWithin(
  regra_id: string,
  titulo: string,
  leigo: string,
  part: Component | undefined,
  min: number | undefined,
  max: number | undefined,
  battery: Extract<Component, { categoria: "bateria" }> | undefined,
): RuleResult | null {
  if (!part || !battery) return null;
  const base: RuleBase = {
    regra_id,
    titulo,
    severidade: "bloqueante",
    explicacao_leiga: leigo,
    componentes: [part, battery],
  };
  const cells = battery.specs.celulas;
  if (cells === undefined || min === undefined || max === undefined) {
    return result(base, "sem_dado", {
      tecnica: "Falta o número de células da bateria ou a faixa aceita pela peça.",
      sugestao: "Confira no datasheet quantas células (S) a peça aceita.",
    });
  }
  return result(base, cells >= min && cells <= max ? "passou" : "falhou", {
    tecnica: `Bateria ${cells}S; a peça aceita de ${min}S a ${max}S.`,
    sugestao: `Use uma bateria entre ${min}S e ${max}S ou outra peça.`,
    valores: { celulas: cells, min, max },
  });
}

const motorCells: RuleFn = ({ build }) => {
  const motor = firstOf(build, "motor")?.componente;
  return cellsWithin(
    "celulas_motor",
    "A bateria tem a tensão certa para o motor (KV × células)",
    "O KV do motor foi pensado para um número de células da bateria. Com tensão alta demais o motor e o ESC esquentam e queimam; com tensão baixa, falta força.",
    motor,
    motor?.specs.celulas_min,
    motor?.specs.celulas_max,
    firstOf(build, "bateria")?.componente,
  );
};

const escCells: RuleFn = ({ build }) => {
  const esc = escOf(build);
  return cellsWithin(
    "celulas_esc",
    "O ESC aguenta a tensão da bateria",
    "Cada ESC (controlador do motor) suporta uma faixa de tensão. Acima dela ele queima, às vezes pegando fogo.",
    esc?.componente,
    esc?.specs.celulas_min,
    esc?.specs.celulas_max,
    firstOf(build, "bateria")?.componente,
  );
};

const fcCells: RuleFn = ({ build }) => {
  const fc = fcOf(build);
  if (!fc || fc.specs.entrada_celulas_min === undefined) return null;
  return cellsWithin(
    "celulas_fc",
    "A controladora aceita a tensão da bateria",
    "A controladora é ligada direto na bateria e só aceita uma faixa de tensão.",
    fc.componente,
    fc.specs.entrada_celulas_min,
    fc.specs.entrada_celulas_max,
    firstOf(build, "bateria")?.componente,
  );
};

/** Conector por onde a bateria entra no drone: módulo de energia, ESC/stack/AIO ou conector avulso. */
function powerInputConnector(build: Build): { tipo?: string; componente?: Component } {
  const pm = firstOf(build, "modulo_energia")?.componente;
  if (pm?.specs.conector) return { tipo: pm.specs.conector, componente: pm };
  const esc = escOf(build);
  if (esc && "conector_bateria" in esc.specs && esc.specs.conector_bateria) {
    return { tipo: esc.specs.conector_bateria, componente: esc.componente };
  }
  const frame = firstOf(build, "frame")?.componente;
  if (frame?.specs.conector_bateria)
    return { tipo: frame.specs.conector_bateria, componente: frame };
  const conn = firstOf(build, "conector")?.componente;
  if (conn?.specs.tipo) return { tipo: conn.specs.tipo, componente: conn };
  return {};
}

const batteryConnector: RuleFn = ({ build }) => {
  const battery = firstOf(build, "bateria")?.componente;
  if (!battery) return null;
  const input = powerInputConnector(build);
  const base: RuleBase = {
    regra_id: "conector_bateria",
    titulo: "O conector da bateria é o mesmo do drone",
    severidade: "bloqueante",
    explicacao_leiga:
      "A bateria encaixa no drone por um conector (XT60, XT30...). Tipos diferentes não encaixam, e adaptadores improvisados esquentam.",
    componentes: input.componente ? [battery, input.componente] : [battery],
  };
  if (!battery.specs.conector || !input.tipo) {
    return result(base, "sem_dado", {
      tecnica: "Falta o tipo de conector da bateria ou da entrada de energia do drone.",
      sugestao: "Inclua o conector certo na lista (ex.: par de XT60 para soldar).",
    });
  }
  return result(base, battery.specs.conector === input.tipo ? "passou" : "falhou", {
    tecnica: `Bateria: ${battery.specs.conector}. Drone: ${input.tipo}.`,
    sugestao: `Use bateria com conector ${input.tipo} ou troque o conector do drone (solda).`,
  });
};

const escCurrent: RuleFn = ({ build, config }, m) => {
  const esc = escOf(build);
  if (!esc) return null;
  const base: RuleBase = {
    regra_id: "esc_corrente",
    titulo: "O ESC aguenta a corrente do motor",
    severidade: "bloqueante",
    explicacao_leiga:
      "Na potência máxima o motor puxa muita corrente. Se o ESC for fraco, esquenta e pode queimar em voo (o drone cai).",
    componentes: present([esc.componente, firstOf(build, "motor")?.componente]),
    fontes: [config.fontes.esc],
  };
  const max = m.propulsion.corrente_max_por_motor_a;
  const rating = esc.specs.corrente_continua_a;
  if (max === undefined || rating === undefined) {
    return result(base, "sem_dado", {
      tecnica: "Falta a corrente máxima do motor (tabela de empuxo) ou a corrente contínua do ESC.",
      sugestao: "Inclua a tabela de empuxo do conjunto motor + hélice + bateria.",
    });
  }
  const needed = max * config.esc.margem_corrente;
  return result(base, rating >= needed ? "passou" : "falhou", {
    tecnica: `Motor puxa até ${fmt(max)} A; com margem de ${config.esc.margem_corrente}× precisa de ${fmt(needed)} A. ESC: ${fmt(rating)} A contínuos.`,
    sugestao: `Use ESC de pelo menos ${Math.ceil(needed)} A contínuos por motor.`,
    valores: { corrente_motor_a: max, necessario_a: needed, esc_a: rating },
    selo: deriveStatus([m.propulsion.selo, esc.componente.status_verificacao], "estimativa"),
  });
};

const batteryDischarge: RuleFn = ({ build, config }, m) => {
  const battery = firstOf(build, "bateria")?.componente;
  if (!battery) return null;
  const base: RuleBase = {
    regra_id: "bateria_c_rating",
    titulo: "A bateria consegue entregar a corrente (C-rating)",
    severidade: "bloqueante",
    explicacao_leiga:
      "A bateria tem um limite de corrente (capacidade × C). Se o drone pede mais, a tensão despenca, o drone perde força e a bateria esquenta e incha.",
    componentes: [battery],
    fontes: [config.fontes.bateria],
  };
  const total = m.propulsion.corrente_max_total_a;
  const { capacidade_mah: mah, c_continuo: c } = battery.specs;
  if (total === undefined || mah === undefined || c === undefined) {
    return result(base, "sem_dado", {
      tecnica: "Falta a corrente máxima dos motores ou a capacidade/C da bateria.",
      sugestao: "Confira capacidade (mAh) e C contínuo da bateria e a tabela de empuxo.",
    });
  }
  const total_com_eletronicos = total + (m.power.corrente_eletronicos_bateria_a ?? 0);
  const capacity = (mah / 1000) * c;
  const needed = total_com_eletronicos * config.bateria.margem_c;
  return result(base, capacity >= needed ? "passou" : "falhou", {
    tecnica: `Bateria: ${fmt(mah / 1000, 2)} Ah × ${fmt(c, 0)}C = ${fmt(capacity)} A. Pico do drone ≈ ${fmt(total_com_eletronicos)} A; com margem ${config.bateria.margem_c}× precisa de ${fmt(needed)} A.`,
    sugestao: "Use uma bateria com mais capacidade ou C maior.",
    valores: { capacidade_a: capacity, necessario_a: needed },
    selo: deriveStatus([m.propulsion.selo, battery.status_verificacao], "estimativa"),
  });
};

// ---------------------------------------------------------------------------
// Voo: empuxo, TWR, hover
// ---------------------------------------------------------------------------

const canHover: RuleFn = ({ build }, m) => {
  const motor = firstOf(build, "motor")?.componente;
  const base: RuleBase = {
    regra_id: "paira",
    titulo: "Os motores conseguem levantar o drone",
    severidade: "bloqueante",
    explicacao_leiga:
      "Se a força máxima dos motores for menor que o peso, o drone não sai do chão.",
    componentes: motor ? [motor] : [],
  };
  if (m.propulsion.paira === undefined) {
    return result(base, "sem_dado", {
      tecnica: `Sem dado para calcular: ${m.propulsion.faltando.join(", ") || "massa ou empuxo"}.`,
      sugestao: "Complete as massas das peças e a tabela de empuxo do conjunto.",
      selo: "nao_verificado",
    });
  }
  return result(base, m.propulsion.paira ? "passou" : "falhou", {
    tecnica: `Empuxo total ${fmt(m.propulsion.empuxo_total_g ?? 0, 0)} g para ${fmt(m.auw.massa_total_g ?? 0, 0)} g de peso.${m.auw.estimadas.length > 0 ? ` Massa estimada (sem dado do fabricante): ${m.auw.estimadas.join(", ")}.` : ""}`,
    sugestao: "Reduza o peso ou use motores/hélices/bateria com mais empuxo.",
    selo: m.propulsion.selo,
  });
};

const twrMinimum: RuleFn = ({ config }, m) => {
  const base: RuleBase = {
    regra_id: "twr_minimo",
    titulo: "Sobra força para voar com segurança (TWR)",
    severidade: "bloqueante",
    explicacao_leiga: `TWR é a força máxima dos motores dividida pelo peso. Abaixo de ${config.twr.minimo_seguro} não sobra força para corrigir vento e manobras: o drone fica instável e pode cair.`,
    fontes: [config.fontes.twr, config.fontes.hover],
  };
  const twr = m.propulsion.twr;
  if (twr === undefined) {
    return result(base, "sem_dado", {
      tecnica: `Sem dado para calcular o TWR: ${m.propulsion.faltando.join(", ") || "empuxo ou peso"}.`,
      sugestao: "Complete as massas e a tabela de empuxo.",
      selo: "nao_verificado",
    });
  }
  return result(base, twr >= config.twr.minimo_seguro ? "passou" : "falhou", {
    tecnica: `TWR = ${fmt(m.propulsion.empuxo_total_g ?? 0, 0)} g / ${fmt(m.auw.massa_total_g ?? 0, 0)} g = ${fmt(twr, 2)}.`,
    sugestao:
      "Reduza o peso (bateria menor, menos acessórios) ou aumente o empuxo (motor/hélice/células).",
    valores: { twr },
    selo: m.propulsion.selo,
  });
};

const twrTarget: RuleFn = ({ archetype }, m) => {
  const twr = m.propulsion.twr;
  if (twr === undefined) return null;
  const [min, max] = archetype.faixas.twr_alvo;
  const base: RuleBase = {
    regra_id: "twr_alvo_arquetipo",
    titulo: `TWR na faixa ideal para ${archetype.nome}`,
    severidade: "alerta",
    explicacao_leiga:
      "Cada tipo de drone tem uma faixa de força ideal: filmagem quer suavidade; freestyle e corrida querem muita força.",
  };
  return result(base, twr >= min && twr <= max ? "passou" : "falhou", {
    tecnica: `TWR ${fmt(twr, 2)}; faixa do arquétipo: ${fmt(min, 1)} a ${fmt(max, 1)}.`,
    sugestao:
      twr < min
        ? "Para este uso, mais força deixaria o voo mais seguro e responsivo."
        : "Força acima do necessário: o drone fica mais nervoso e gasta mais bateria.",
    valores: { twr, min, max },
    selo: m.propulsion.selo,
  });
};

const hoverThrottle: RuleFn = ({ config }, m) => {
  const hover = m.propulsion.hover;
  if (!hover) return null;
  const base: RuleBase = {
    regra_id: "hover_throttle",
    titulo: "Paira com folga no acelerador",
    severidade: "alerta",
    explicacao_leiga: `O ideal é pairar perto de ${config.hover.ideal_pct}% do acelerador: assim sobra força para subir, frear e lutar contra o vento.`,
    fontes: [config.fontes.hover],
  };
  const pct = hover.throttle_pct;
  const prefixo = hover.precisao === "abaixo_da_tabela" ? "no máximo " : "";
  return result(base, pct <= config.hover.alerta_acima_de_pct ? "passou" : "falhou", {
    tecnica: `Pairar exige ${prefixo}${fmt(pct, 0)}% do acelerador (limite de alerta: ${config.hover.alerta_acima_de_pct}%).`,
    sugestao: "Diminua o peso ou aumente o empuxo para pairar perto de 50%.",
    valores: { hover_pct: pct },
    selo: m.propulsion.selo,
  });
};

const weightLimit: RuleFn = ({ archetype }, m) => {
  const limit = archetype.massa_max_g;
  if (limit === undefined) return null;
  const base: RuleBase = {
    regra_id: "massa_limite_arquetipo",
    titulo: `Peso dentro do limite do arquétipo (até ${limit} g)`,
    severidade: "bloqueante",
    explicacao_leiga:
      "Este tipo de drone promete ficar abaixo de um peso (ex.: 250 g, que muda as regras de voo e a segurança). Passar do limite quebra a promessa.",
  };
  const massa = m.auw.massa_total_g;
  if (massa === undefined) {
    return result(base, "sem_dado", {
      tecnica: `Faltam massas de: ${m.auw.faltando.join(", ")}.`,
      sugestao: "Complete as massas das peças.",
      selo: "nao_verificado",
    });
  }
  return result(base, massa <= limit ? "passou" : "falhou", {
    tecnica: `Peso estimado ${fmt(massa, 0)} g (inclui ${fmt(m.auw.margem_g, 0)} g de margem) para limite de ${limit} g.`,
    sugestao: "Troque por peças mais leves (bateria menor, câmera/VTX integrados).",
    valores: { massa_g: massa, limite_g: limit },
    selo: m.auw.selo,
  });
};

// ---------------------------------------------------------------------------
// Eletrônica: firmware, UARTs, rádio, alimentação, vídeo
// ---------------------------------------------------------------------------

const fcFirmware: RuleFn = ({ build, archetype }) => {
  const fc = fcOf(build);
  if (!fc) return null;
  const base: RuleBase = {
    regra_id: "fc_firmware_oficial",
    titulo: `A controladora roda ${archetype.firmware} (lista oficial)`,
    severidade: "bloqueante",
    explicacao_leiga: `O "cérebro" do drone precisa constar na lista oficial de placas do ${archetype.firmware}; placas fora da lista podem não ter firmware ou ter defeitos sem suporte.`,
    componentes: [fc.componente],
    fontes: archetype.firmware === "ArduPilot" ? [SRC.ardupilotAutopilots] : [SRC.spec],
  };
  const fw = fc.specs.firmwares;
  if (!fw?.length) {
    return result(base, "sem_dado", {
      tecnica: "O catálogo não informa os firmwares suportados pela FC.",
      sugestao: `Confira se a placa está na lista oficial do ${archetype.firmware}.`,
    });
  }
  const match = fw.find((f) => f.nome === archetype.firmware && f.lista_oficial);
  return result(base, match ? "passou" : "falhou", {
    tecnica: match
      ? `Alvo oficial: ${match.alvo}.`
      : `Firmwares informados: ${fw.map((f) => `${f.nome} (${f.alvo})`).join(", ")}.`,
    sugestao: `Escolha uma FC que esteja na lista oficial do ${archetype.firmware}.`,
  });
};

const fcFlash: RuleFn = (ctx) => {
  if (!isArduPilot(ctx)) return null;
  const fc = fcOf(ctx.build);
  if (!fc) return null;
  const min = ctx.config.ardupilot.flash_min_mb;
  const base: RuleBase = {
    regra_id: "fc_memoria_ardupilot",
    titulo: `A controladora tem memória para o ArduPilot completo (${min} MB)`,
    severidade: "bloqueante",
    explicacao_leiga:
      "Placas com 1 MB de memória rodam uma versão reduzida do ArduPilot e podem não conseguir calibrar a bússola, que é essencial para o GPS e o retorno automático.",
    componentes: [fc.componente],
    fontes: [ctx.config.fontes.flash],
  };
  const flash = fc.specs.flash_mb;
  if (flash === undefined) {
    return result(base, "sem_dado", {
      tecnica: "O catálogo não informa a memória flash da FC.",
      sugestao: "Confira o processador da placa (H7 costuma ter 2 MB).",
    });
  }
  return result(base, flash >= min ? "passou" : "falhou", {
    tecnica: `Flash: ${fmt(flash, 1)} MB (mínimo: ${min} MB).`,
    sugestao: "Use uma FC de classe H7 (2 MB) da lista oficial do ArduPilot.",
    valores: { flash_mb: flash, minimo_mb: min },
  });
};

const motorOutputs: RuleFn = ({ build }) => {
  const fc = fcOf(build);
  const motores = firstOf(build, "motor")?.quantidade_no_drone;
  if (!fc || !motores) return null;
  const base: RuleBase = {
    regra_id: "saidas_motor",
    titulo: "A controladora tem saídas para todos os motores",
    severidade: "bloqueante",
    explicacao_leiga: "Cada motor precisa de uma saída de sinal na controladora.",
    componentes: [fc.componente],
  };
  const outs = fc.specs.saidas_motor;
  if (outs === undefined) {
    return result(base, "sem_dado", {
      tecnica: "O catálogo não informa as saídas de motor da FC.",
    });
  }
  return result(base, outs >= motores ? "passou" : "falhou", {
    tecnica: `${outs} saídas para ${motores} motores.`,
    sugestao: "Use uma FC com mais saídas de motor.",
  });
};

/** UARTs necessárias no Arquétipo 1: rádio + GPS + telemetria (ou rádio/telemetria juntos). */
export function requiredUarts(build: Build): { total: number; usos: string[] } {
  const usos: string[] = [];
  if (receiverOf(build)?.componente.categoria === "receptor") {
    usos.push(
      build.opcoes.telemetria === "elrs_mavlink"
        ? "receptor ELRS (controle + telemetria MAVLink)"
        : "receptor de rádio",
    );
  }
  if (firstOf(build, "gps")) usos.push("GPS");
  if (build.opcoes.telemetria === "wifi_no_drone" && firstOf(build, "telemetria")) {
    usos.push("telemetria Wi-Fi para o celular");
  }
  return { total: usos.length, usos };
}

const uartCount: RuleFn = ({ build }) => {
  const fc = fcOf(build);
  if (!fc || fc.componente.categoria === "fc_aio") return null;
  const { total, usos } = requiredUarts(build);
  if (total === 0) return null;
  const base: RuleBase = {
    regra_id: "uarts_suficientes",
    titulo: "A controladora tem portas seriais (UARTs) para tudo",
    severidade: "bloqueante",
    explicacao_leiga:
      "Receptor do rádio, GPS e telemetria conversam com a controladora por portas seriais (UARTs). Cada um precisa da sua; sem porta livre, um deles fica de fora.",
    componentes: [fc.componente],
    fontes: [SRC.ardupilotAutopilots],
  };
  const uarts = fc.specs.uarts;
  if (!uarts) {
    return result(base, "sem_dado", {
      tecnica: `Precisa de ${total} UART(s): ${usos.join(", ")}. O catálogo não lista as UARTs da FC.`,
      sugestao: "Confira no manual da FC quantas UARTs ficam livres.",
    });
  }
  return result(base, uarts.length >= total ? "passou" : "falhou", {
    tecnica: `Precisa de ${total} (${usos.join(", ")}); a FC tem ${uarts.length} livre(s): ${uarts.map((u) => u.nome).join(", ")}.`,
    sugestao:
      build.opcoes.telemetria === "wifi_no_drone"
        ? "Use uma FC com mais UARTs ou passe a telemetria para o modo MAVLink do ELRS (mesma porta do rádio)."
        : "Use uma FC com mais UARTs.",
    valores: { necessarias: total, disponiveis: uarts.length },
  });
};

const rcDma: RuleFn = (ctx) => {
  if (!isArduPilot(ctx)) return null;
  const fc = fcOf(ctx.build);
  const rx = receiverOf(ctx.build);
  if (!fc || !rx || rx.componente.categoria !== "receptor") return null;
  const mcu = fc.specs.mcu ?? "";
  if (!/F4|F7/i.test(mcu)) return null;
  const base: RuleBase = {
    regra_id: "uart_rc_dma",
    titulo: "A porta do receptor ELRS tem DMA (placas F4/F7)",
    severidade: "alerta",
    explicacao_leiga:
      "Em placas F4/F7, o ArduPilot pede uma porta com DMA para o receptor ELRS funcionar de forma confiável.",
    componentes: [fc.componente],
    fontes: [SRC.ardupilotElrs],
  };
  const withDma = fc.specs.uarts?.some((u) => u.dma_rx === true);
  if (withDma === undefined)
    return result(base, "sem_dado", { tecnica: "O catálogo não informa DMA nas UARTs." });
  return result(base, withDma ? "passou" : "falhou", {
    tecnica: withDma ? "Há UART com DMA no RX." : "Nenhuma UART listada com DMA no RX.",
    sugestao: "Ligue o receptor numa UART com DMA (veja o manual da placa).",
  });
};

const radioLink: RuleFn = ({ build }) => {
  const radio = firstOf(build, "radio_tx")?.componente;
  const rx = receiverOf(build);
  if (!radio || !rx) return null;
  const base: RuleBase = {
    regra_id: "radio_receptor_mesmo_link",
    titulo: "Rádio e receptor falam o mesmo protocolo",
    severidade: "bloqueante",
    explicacao_leiga:
      "O controle (rádio) e o receptor do drone precisam usar o mesmo sistema (ex.: ExpressLRS 2,4 GHz) para se conectar.",
    componentes: [radio, rx.componente],
  };
  if (!radio.specs.link || !rx.specs.link) {
    return result(base, "sem_dado", { tecnica: "Falta o protocolo do rádio ou do receptor." });
  }
  return result(base, radio.specs.link === rx.specs.link ? "passou" : "falhou", {
    tecnica: `Rádio: ${radio.specs.link}. Receptor: ${rx.specs.link}.`,
    sugestao: "Use receptor do mesmo sistema do rádio.",
  });
};

const elrsMavlinkRequirements: RuleFn = ({ build }) => {
  if (build.opcoes.telemetria !== "elrs_mavlink") return null;
  const radio = firstOf(build, "radio_tx")?.componente;
  const rx = receiverOf(build);
  const base: RuleBase = {
    regra_id: "elrs_mavlink_requisitos",
    titulo: "Rádio e receptor suportam o modo MAVLink do ELRS (telemetria no celular)",
    severidade: "bloqueante",
    explicacao_leiga:
      "Para mandar mapa, bateria e altura ao celular pelo próprio rádio, o receptor e o transmissor precisam ser do tipo ESP, e o rádio precisa de Wi-Fi (backpack).",
    componentes: present([radio, rx?.componente]),
    fontes: [SRC.elrsMavlink, SRC.ardupilotElrs],
  };
  if (!radio || !rx)
    return result(base, "sem_dado", { tecnica: "Falta rádio ou receptor no build." });
  const { esp: rxEsp } = rx.specs;
  const { esp: txEsp, backpack_wifi: backpack } = radio.specs;
  if (rxEsp === undefined || txEsp === undefined || backpack === undefined) {
    return result(base, "sem_dado", {
      tecnica: "O catálogo não informa se receptor/rádio são ESP ou se o rádio tem backpack Wi-Fi.",
      sugestao: "Confira nos datasheets (ESP = tem Wi-Fi) ou use telemetria Wi-Fi no drone.",
    });
  }
  const ok = rxEsp && txEsp && backpack;
  return result(base, ok ? "passou" : "falhou", {
    tecnica: `Receptor ESP: ${rxEsp ? "sim" : "não"}. Rádio ESP: ${txEsp ? "sim" : "não"}. Backpack Wi-Fi: ${backpack ? "sim" : "não"}. Requer ELRS ≥ 3.5.0 e TX Backpack ≥ 1.5.0.`,
    sugestao: "Use rádio e receptor ESP com backpack Wi-Fi, ou a telemetria Wi-Fi no drone.",
  });
};

const receiverOutput: RuleFn = ({ build, archetype }) => {
  const rx = receiverOf(build);
  if (!rx || rx.componente.categoria !== "receptor") return null;
  const needed = build.opcoes.telemetria === "elrs_mavlink" ? "MAVLink" : "CRSF";
  const base: RuleBase = {
    regra_id: "receptor_saida_serial",
    titulo: `O receptor fala ${needed} com a controladora`,
    severidade: "bloqueante",
    explicacao_leiga: `O ${archetype.firmware} entende o receptor ELRS pelo protocolo ${needed}.`,
    componentes: [rx.componente],
    fontes: [SRC.ardupilotElrs],
  };
  const outs = rx.specs.saidas;
  if (!outs?.length)
    return result(base, "sem_dado", { tecnica: "O catálogo não lista as saídas do receptor." });
  return result(base, outs.includes(needed) ? "passou" : "falhou", {
    tecnica: `Saídas do receptor: ${outs.join(", ")}; precisa de ${needed}.`,
    sugestao: `Use um receptor com saída ${needed}.`,
  });
};

const becBudget: RuleFn = ({ build, config }, m) => {
  const fc = fcOf(build);
  if (!fc || fc.componente.categoria === "fc_aio") return null;
  const loads = m.power.atribuicoes;
  if (loads.length === 0) return null;
  const base: RuleBase = {
    regra_id: "bec_alimentacao",
    titulo: "A controladora consegue alimentar câmera, VTX, GPS e receptor",
    severidade: "bloqueante",
    explicacao_leiga:
      "Os reguladores de tensão (BECs) da controladora têm um limite de corrente. Se câmera, transmissor de vídeo, GPS e receptor pedirem mais, a tensão cai: o vídeo some ou a controladora reinicia no ar.",
    componentes: [fc.componente],
  };
  // Sem fonte por incompatibilidade de tensão (não por falta de dado, que vira "sem dado").
  const semFonte = loads.filter(
    (a) => a.fonte === null && !m.power.sem_dado.includes(a.componente_id),
  );
  if (semFonte.length > 0) {
    return result(base, "falhou", {
      tecnica: `Sem fonte compatível para: ${semFonte.map((a) => `${a.categoria} (${a.tensao_min_v}–${a.tensao_max_v} V)`).join(", ")}.`,
      sugestao:
        "Use uma FC com BEC na tensão certa ou alimente a peça direto da bateria, se ela aceitar.",
    });
  }
  const becs = fc.specs.becs ?? [];
  const over = m.power.carga_por_bec_a
    .map((carga, i) => ({ carga, bec: becs[i] }))
    .filter(
      ({ carga, bec }) => bec !== undefined && carga > bec.corrente_a * config.bec.uso_maximo,
    );
  if (m.power.sem_dado.length > 0) {
    return result(base, "sem_dado", {
      tecnica: `Sem tensão ou consumo informados para: ${m.power.sem_dado.join(", ")}.`,
      sugestao: "Confira no datasheet a tensão de entrada e o consumo de cada eletrônico.",
    });
  }
  const resumo = m.power.carga_por_bec_a
    .map(
      (c, i) =>
        `BEC ${becs[i]?.tensao_v ?? "?"} V: ${fmt(c, 2)} A de ${fmt(becs[i]?.corrente_a ?? 0, 1)} A`,
    )
    .join("; ");
  const presumidos = m.power.atribuicoes.filter((a) => a.corrente_presumida);
  const hipotese =
    presumidos.length > 0
      ? ` Consumo não publicado pelo fabricante (usamos hipótese conservadora): ${presumidos
          .map((a) => `${a.categoria} ${fmt((a.corrente_a ?? 0) * 1000, 0)} mA`)
          .join(", ")}.`
      : "";
  return result(base, over.length === 0 ? "passou" : "falhou", {
    tecnica: `${resumo}. Uso máximo recomendado: ${config.bec.uso_maximo * 100}% de cada BEC.${hipotese}`,
    sugestao: "Reduza a potência do VTX, alimente o VTX direto da bateria ou use um BEC externo.",
    // Com hipótese de consumo, o resultado é no máximo uma estimativa.
    selo: sealOf(base.componentes ?? [], presumidos.length > 0 ? "estimativa" : "comparacao"),
  });
};

/** O módulo de energia (e os fios/conector dele) aguenta a corrente do drone? */
const powerModuleCurrent: RuleFn = ({ build }, m) => {
  const pm = itemsOf(build, "modulo_energia")
    .map((i) => i.componente)
    .find((c) => c.specs.corrente_continua_a !== undefined);
  if (!pm) return null;
  const continua = pm.specs.corrente_continua_a;
  const max = m.propulsion.corrente_max_total_a;
  const hover = m.propulsion.corrente_hover_motores_a;
  const base: RuleBase = {
    regra_id: "modulo_energia_corrente",
    titulo: "O módulo de energia aguenta a corrente do voo",
    severidade: "alerta",
    explicacao_leiga:
      "Toda a energia passa pelo módulo de energia. Se a corrente passar do limite dele por muito tempo, ele e os fios esquentam.",
    componentes: [pm],
  };
  if (continua === undefined || max === undefined || hover === undefined) {
    return result(base, "sem_dado", {
      tecnica: "Falta a corrente do módulo de energia ou a corrente dos motores.",
    });
  }
  const pico = max + (m.power.corrente_eletronicos_bateria_a ?? 0);
  return result(base, pico <= continua ? "passou" : "falhou", {
    tecnica: `Limite contínuo do módulo: ${fmt(continua, 0)} A. Pairando: ≈ ${fmt(hover, 1)} A. Tudo no máximo: ≈ ${fmt(pico, 0)} A.`,
    sugestao:
      "Normal em voo calmo (pairar fica bem abaixo do limite), mas evite acelerar ao máximo por vários segundos seguidos.",
    valores: { limite_continuo_a: continua, pico_a: pico, pairar_a: hover },
    selo: deriveStatus([m.propulsion.selo, pm.status_verificacao], "estimativa"),
  });
};

const voltageMonitor: RuleFn = (ctx) => {
  if (!isArduPilot(ctx)) return null;
  const fc = fcOf(ctx.build);
  const pm = firstOf(ctx.build, "modulo_energia")?.componente;
  const base: RuleBase = {
    regra_id: "monitor_bateria",
    titulo: "O drone mede a bateria (necessário para o failsafe de bateria)",
    severidade: "bloqueante",
    explicacao_leiga:
      "Para voltar sozinho quando a bateria está acabando, a controladora precisa medir a tensão (e de preferência a corrente) da bateria.",
    componentes: present([fc?.componente, pm]),
    fontes: [SRC.ardupilotBatteryFailsafe],
  };
  // Basta uma fonte medir: o módulo de energia OU a própria FC.
  const anyTrue = (values: Array<boolean | undefined>) =>
    values.includes(true) ? true : values.includes(undefined) ? undefined : false;
  const modulos = itemsOf(ctx.build, "modulo_energia").map((i) => i.componente);
  const tensao = anyTrue([...modulos.map((m) => m.specs.mede_tensao), fc?.specs.sensor_tensao]);
  if (tensao === undefined) {
    return result(base, "sem_dado", {
      tecnica: "O catálogo não informa se a FC ou o módulo de energia medem a tensão.",
      sugestao: "Use um módulo de energia (power module) ou uma FC com sensor de tensão.",
    });
  }
  const corrente =
    anyTrue([...modulos.map((m) => m.specs.mede_corrente), fc?.specs.sensor_corrente]) ?? false;
  return result(base, tensao ? "passou" : "falhou", {
    tecnica: `Mede tensão: ${tensao ? "sim" : "não"}; mede corrente: ${corrente ? "sim" : "não"}.`,
    sugestao: "Inclua um módulo de energia (power module).",
  });
};

const videoSystem: RuleFn = ({ build }) => {
  const cam = firstOf(build, "camera_fpv")?.componente;
  const vtx = firstOf(build, "vtx")?.componente;
  const rx =
    firstOf(build, "receptor_video")?.componente ?? firstOf(build, "oculos_fpv")?.componente;
  if (!cam && !vtx) return null;
  const parts = present([cam, vtx, rx]);
  const base: RuleBase = {
    regra_id: "sistema_video",
    titulo: "Câmera, transmissor e receptor de vídeo são do mesmo sistema",
    severidade: "bloqueante",
    explicacao_leiga:
      "Vídeo analógico e os sistemas digitais (DJI, Walksnail, HDZero) não conversam entre si: câmera, transmissor (VTX) e tela/óculos precisam ser do mesmo sistema.",
    componentes: parts,
  };
  const systems = parts.map((p) => ("sistema" in p.specs ? p.specs.sistema : undefined));
  if (systems.some((s) => s === undefined) || parts.length < 3) {
    return result(base, "sem_dado", {
      tecnica: "Falta peça da corrente de vídeo ou o sistema de alguma delas.",
      sugestao: "Inclua câmera, VTX e receptor (USB ou óculos) do mesmo sistema.",
    });
  }
  const ok = systems.every((s) => s === systems[0]);
  return result(base, ok ? "passou" : "falhou", {
    tecnica: `Sistemas: ${systems.join(", ")}.`,
    sugestao: "Troque as peças para ficarem todas no mesmo sistema de vídeo.",
  });
};

const vtxAntenna: RuleFn = ({ build }) => {
  const vtx = firstOf(build, "vtx")?.componente;
  const antennas = itemsOf(build, "antena").map((i) => i.componente);
  if (!vtx) return null;
  const base: RuleBase = {
    regra_id: "antena_vtx",
    titulo: "O transmissor de vídeo tem antena compatível",
    severidade: "bloqueante",
    explicacao_leiga:
      "Ligar o transmissor de vídeo sem antena (ou com antena errada) pode queimá-lo em segundos. O conector precisa ser o mesmo.",
    componentes: [vtx, ...antennas],
  };
  const conn = vtx.specs.conector_antena;
  const match = antennas.find(
    (a) => a.specs.conector === conn && (a.specs.frequencia_ghz ?? 0) > 5,
  );
  if (!conn || antennas.length === 0) {
    return result(base, "sem_dado", {
      tecnica: "Falta a antena de vídeo ou o tipo de conector do VTX.",
      sugestao: "Inclua uma antena de 5,8 GHz com o conector do VTX.",
    });
  }
  return result(base, match ? "passou" : "falhou", {
    tecnica: `VTX: ${conn}. Antenas: ${antennas.map((a) => `${a.specs.conector ?? "?"} ${a.specs.frequencia_ghz ?? "?"} GHz`).join(", ")}.`,
    sugestao: `Use antena de 5,8 GHz com conector ${conn}.`,
  });
};

const gpsWithCompass: RuleFn = (ctx) => {
  if (!isArduPilot(ctx)) return null;
  const gps = firstOf(ctx.build, "gps")?.componente;
  const base: RuleBase = {
    regra_id: "gps_com_bussola",
    titulo: "Tem GPS com bússola (necessário para o retorno automático)",
    severidade: "bloqueante",
    explicacao_leiga:
      "Para saber onde está e voltar para casa sozinho, o drone precisa de GPS e de bússola (normalmente no mesmo módulo).",
    componentes: gps ? [gps] : [],
    fontes: [SRC.ardupilotRtl],
  };
  if (!gps) {
    return result(base, "falhou", {
      tecnica: "Nenhum módulo GPS no build.",
      sugestao: "Inclua um módulo GPS com bússola.",
      selo: "verificado",
    });
  }
  if (gps.specs.bussola === undefined) {
    return result(base, "sem_dado", { tecnica: "O catálogo não informa se o GPS tem bússola." });
  }
  return result(base, gps.specs.bussola ? "passou" : "falhou", {
    tecnica: gps.specs.bussola ? `Bússola: ${gps.specs.bussola}.` : "Módulo sem bússola.",
    sugestao: "Use um módulo GPS com bússola integrada.",
  });
};

const compassDistance: RuleFn = (ctx) => {
  if (!isArduPilot(ctx)) return null;
  const gps = firstOf(ctx.build, "gps")?.componente;
  if (!gps) return null;
  const mastItem = firstOf(ctx.build, "mastro_gps")?.componente;
  const frame = firstOf(ctx.build, "frame")?.componente;
  // Suporte avulso ou o que já vem com o frame (ex.: X500 V2).
  const mast: { componente: Component; altura?: number } | undefined = mastItem
    ? { componente: mastItem, altura: mastItem.specs.altura_mm }
    : frame?.specs.mastro_gps_mm !== undefined
      ? { componente: frame, altura: frame.specs.mastro_gps_mm }
      : undefined;
  const min = ctx.config.bussola.distancia_min_mm;
  const base: RuleBase = {
    regra_id: "bussola_longe_da_potencia",
    titulo: `Bússola a pelo menos ${min / 10} cm dos fios de potência (mastro)`,
    severidade: "bloqueante",
    explicacao_leiga:
      "Fios grossos da bateria e dos motores criam campo magnético que engana a bússola. Com a bússola enganada, o drone voa em círculos e pode errar o caminho de volta. O mastro afasta o GPS dessa interferência.",
    componentes: mast ? [gps, mast.componente] : [gps],
    fontes: [ctx.config.fontes.bussola, SRC.ardupilotMagInterference],
  };
  if (!mast) {
    return result(base, "falhou", {
      tecnica: `Sem mastro de GPS no build; a distância mínima recomendada é ${min} mm.`,
      sugestao:
        "Inclua um mastro de GPS (os dobráveis são baratos) e passe os fios de potência longe dele.",
      selo: "estimativa",
    });
  }
  const h = mast.altura;
  if (h === undefined) {
    return result(base, "sem_dado", { tecnica: "O catálogo não informa a altura do mastro." });
  }
  return result(base, h >= min ? "passou" : "falhou", {
    tecnica: `Mastro de ${h} mm (mínimo ${min} mm acima da placa onde passam os fios de potência).`,
    sugestao: `Use mastro de pelo menos ${min} mm.`,
    valores: { altura_mm: h, minimo_mm: min },
    selo: deriveStatus([mast.componente.status_verificacao], "estimativa"),
  });
};

/** Parâmetros que o failsafe de retorno exige (ArduCopter 4.7). */
const REQUIRED_FAILSAFE_PARAMS: Array<{
  nome: string;
  valores: Array<number | string>;
  motivo: string;
}> = [
  { nome: "FS_THR_ENABLE", valores: [1], motivo: "perda do rádio → RTL" },
  { nome: "BATT_FS_LOW_ACT", valores: [2], motivo: "bateria baixa → RTL" },
  { nome: "FENCE_ENABLE", valores: [1], motivo: "cerca virtual ligada" },
];

const failsafeToRtl: RuleFn = (ctx) => {
  if (!isArduPilot(ctx)) return null;
  const base: RuleBase = {
    regra_id: "failsafe_rtl",
    titulo: "Failsafe configurado para voltar para casa (RTL)",
    severidade: "bloqueante",
    explicacao_leiga:
      "Se o rádio perder o sinal ou a bateria ficar baixa, o drone precisa voltar sozinho para o ponto de decolagem em vez de cair ou fugir.",
    fontes: [SRC.ardupilotRadioFailsafe, SRC.ardupilotBatteryFailsafe, SRC.ardupilotFence],
  };
  const params = ctx.firmwareProfile
    ? resolveFirmwareParams(ctx.firmwareProfile, ctx.build).parametros
    : undefined;
  if (!params) {
    return result(base, "sem_dado", {
      tecnica: "Não há perfil de parâmetros de firmware para este build.",
      sugestao: "Use o perfil de parâmetros do Arquétipo 1 (ArduCopter 4.7).",
      selo: "nao_verificado",
    });
  }
  const missing = REQUIRED_FAILSAFE_PARAMS.filter(
    (req) => !params.some((p) => p.nome === req.nome && req.valores.includes(p.valor)),
  );
  return result(base, missing.length === 0 ? "passou" : "falhou", {
    tecnica:
      missing.length === 0
        ? REQUIRED_FAILSAFE_PARAMS.map((r) => `${r.nome}=${r.valores[0]} (${r.motivo})`).join("; ")
        : `Faltando: ${missing.map((r) => `${r.nome}=${r.valores[0]} (${r.motivo})`).join("; ")}.`,
    sugestao: "Inclua os parâmetros de failsafe no perfil de configuração.",
    selo: "estimativa",
  });
};

const beginnerProps: RuleFn = ({ build, archetype }) => {
  const prop = firstOf(build, "helice")?.componente;
  if (!prop || archetype.id === "a2-fpv-5pol") return null;
  const base: RuleBase = {
    regra_id: "helice_segura_iniciante",
    titulo: "Hélices de plástico para quem está aprendendo",
    severidade: "alerta",
    explicacao_leiga:
      "Hélices de fibra de carbono são rígidas e muito afiadas: cortam a pele com facilidade. Para aprender, as de plástico quebram antes de machucar tanto.",
    componentes: [prop],
    fontes: [SRC.ardupilotSafety],
  };
  if (!prop.specs.material)
    return result(base, "sem_dado", { tecnica: "O catálogo não informa o material da hélice." });
  return result(base, prop.specs.material === "fibra_de_carbono" ? "falhou" : "passou", {
    tecnica: `Material: ${prop.specs.material}.`,
    sugestao: "Prefira hélices de plástico até ganhar experiência.",
  });
};

const phoneGroundStation: RuleFn = ({ build }) => {
  if (build.opcoes.telemetria === "nenhuma") return null;
  const base: RuleBase = {
    regra_id: "celular_estacao_de_solo",
    titulo: "O celular roda o QGroundControl e mostra o vídeo",
    severidade: "alerta",
    explicacao_leiga:
      "O QGroundControl (mapa, bateria e botões de retorno) tem versão oficial só para Android 9 ou mais novo. O vídeo do receptor USB também depende do celular.",
    fontes: [SRC.qgcInstall, SRC.qgcVideo],
  };
  if (build.opcoes.celular === "desconhecido") {
    return result(base, "sem_dado", {
      tecnica: "Não sabemos se o celular é Android ou iPhone.",
      sugestao:
        "Informe o celular: com iPhone, a estação de solo precisa ser um Android ou notebook.",
      selo: "verificado",
    });
  }
  return result(base, build.opcoes.celular === "android" ? "passou" : "falhou", {
    tecnica:
      build.opcoes.celular === "android"
        ? "Android: QGroundControl oficial (Android 9+). Vídeo USB (UVC) depende do aparelho; teste antes."
        : "iPhone: o QGroundControl não tem versão oficial para iOS, e receptores de vídeo USB costumam ser só para Android.",
    sugestao:
      "Use um celular/tablet Android barato como tela de solo, ou um notebook com QGroundControl.",
    selo: "verificado",
  });
};

const phoneOnlyControl: RuleFn = ({ build }) => {
  if (build.opcoes.controle !== "celular_experimental") return null;
  return result(
    {
      regra_id: "controle_so_pelo_celular",
      titulo: "Controle só pelo celular (experimental)",
      severidade: "alerta",
      explicacao_leiga:
        "Pilotar só pelo joystick na tela do celular tem alcance curto, atraso, sofre interferência e, se o celular travar ou a bateria dele acabar, você perde o controle. O rádio RC é o recomendado.",
      fontes: [SRC.qgcVirtualJoystick, SRC.ardupilotGcsOnly],
    },
    "falhou",
    {
      tecnica:
        "QGroundControl: o joystick virtual 'não é tão responsivo quanto um rádio RC' (vai por MAVLink). ArduPilot: operação só por GCS exige failsafe de GCS (FS_GCS_ENABLE) e ajustes de arme.",
      sugestao: "Use o rádio RC como controle principal e o celular como tela (estação de solo).",
      selo: "verificado",
    },
  );
};

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

export const DRONE_RULES: readonly RuleFn[] = [
  propFitsFrame,
  motorMountsOnFrame,
  stackMountsOnFrame,
  propMountsOnMotor,
  motorCells,
  escCells,
  fcCells,
  batteryConnector,
  escCurrent,
  batteryDischarge,
  canHover,
  twrMinimum,
  twrTarget,
  hoverThrottle,
  weightLimit,
  fcFirmware,
  fcFlash,
  motorOutputs,
  uartCount,
  rcDma,
  radioLink,
  elrsMavlinkRequirements,
  receiverOutput,
  becBudget,
  powerModuleCurrent,
  voltageMonitor,
  videoSystem,
  vtxAntenna,
  gpsWithCompass,
  compassDistance,
  failsafeToRtl,
  beginnerProps,
  phoneGroundStation,
  phoneOnlyControl,
];

export function validateBuild(ctx: ValidationContext): {
  report: ValidationReport;
  metrics: BuildMetrics;
} {
  const metrics = computeMetrics(ctx);
  const results = DRONE_RULES.map((rule) => rule(ctx, metrics)).filter(
    (r): r is RuleResult => r !== null,
  );
  return { report: buildReport(results), metrics };
}
