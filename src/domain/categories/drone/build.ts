import type { Component, ComponentCategory, ComponentOf } from "./schema";

/*
 * Um "build" é uma combinação concreta de peças do catálogo para um arquétipo.
 * O domínio só lê dados: quem monta o build é o solver (ou a UI, ao trocar uma peça).
 */

/** Como o celular recebe a telemetria (ADR-0013). */
export const TELEMETRY_OPTIONS = ["elrs_mavlink", "wifi_no_drone", "nenhuma"] as const;
export type TelemetryOption = (typeof TELEMETRY_OPTIONS)[number];

/** Controle principal. "celular_experimental" = joystick virtual do QGroundControl (SPEC B.2.1). */
export type ControlMode = "radio" | "celular_experimental";
export type PhoneOs = "android" | "ios" | "desconhecido";
/** Recreativo (aeromodelo) ou não recreativo (ex.: filmagem paga): muda a regra aplicável. */
export type UsageKind = "recreativo" | "nao_recreativo";
export type Tier = "economica" | "equilibrada" | "premium";

export type BuildOptions = {
  telemetria: TelemetryOption;
  controle: ControlMode;
  celular: PhoneOs;
  uso: UsageKind;
  /** Usa óculos FPV (afeta a regra do DECEA: observador obrigatório). */
  oculos_fpv: boolean;
};

export const DEFAULT_BUILD_OPTIONS: BuildOptions = {
  telemetria: "nenhuma",
  controle: "radio",
  celular: "desconhecido",
  uso: "recreativo",
  oculos_fpv: false,
};

export type BuildItem = {
  /** Slot do arquétipo (ex.: "motores"). */
  slot: string;
  componente: Component;
  /** Quantas unidades vão no drone (pesam e consomem). Ex.: 4 hélices. */
  quantidade_no_drone: number;
  /** Quantas unidades comprar (inclui reservas). Ex.: 8 hélices, 2 baterias. */
  quantidade_compra: number;
};

export type Build = {
  arquetipo_id: string;
  itens: BuildItem[];
  opcoes: BuildOptions;
};

/** Peças que ficam no chão: não entram no peso de decolagem. */
export const GROUND_CATEGORIES: ReadonlySet<ComponentCategory> = new Set<ComponentCategory>([
  "radio_tx",
  "carregador",
  "fonte",
  "receptor_video",
  "oculos_fpv",
]);

export function itemsOf<C extends ComponentCategory>(
  build: Build,
  categoria: C,
): Array<BuildItem & { componente: ComponentOf<C> }> {
  return build.itens.filter(
    (item): item is BuildItem & { componente: ComponentOf<C> } =>
      item.componente.categoria === categoria,
  );
}

export function firstOf<C extends ComponentCategory>(
  build: Build,
  categoria: C,
): (BuildItem & { componente: ComponentOf<C> }) | undefined {
  return itemsOf(build, categoria)[0];
}

export function hasCategory(build: Build, categoria: ComponentCategory): boolean {
  return build.itens.some((item) => item.componente.categoria === categoria);
}

/** A peça que faz o papel de FC: FC avulsa, stack (FC+ESC) ou AIO. */
export function fcOf(build: Build) {
  const fc = firstOf(build, "fc");
  if (fc) return { componente: fc.componente, specs: fc.componente.specs };
  const stack = firstOf(build, "stack");
  if (stack) return { componente: stack.componente, specs: stack.componente.specs.fc };
  const aio = firstOf(build, "fc_aio");
  if (aio) return { componente: aio.componente, specs: aio.componente.specs.fc };
  return undefined;
}

/** A peça que faz o papel de ESC: ESC individual (x4), 4 em 1, stack ou AIO. */
export function escOf(build: Build) {
  const single = firstOf(build, "esc");
  if (single)
    return { componente: single.componente, specs: single.componente.specs, individual: true };
  const fourInOne = firstOf(build, "esc_4em1");
  if (fourInOne)
    return {
      componente: fourInOne.componente,
      specs: fourInOne.componente.specs,
      individual: false,
    };
  const stack = firstOf(build, "stack");
  if (stack)
    return { componente: stack.componente, specs: stack.componente.specs.esc, individual: false };
  const aio = firstOf(build, "fc_aio");
  if (aio)
    return { componente: aio.componente, specs: aio.componente.specs.esc, individual: false };
  return undefined;
}

/** Receptor de rádio: avulso ou integrado na AIO. */
export function receiverOf(build: Build) {
  const rx = firstOf(build, "receptor");
  if (rx) return { componente: rx.componente, specs: rx.componente.specs };
  const aio = firstOf(build, "fc_aio");
  if (aio?.componente.specs.receptor)
    return { componente: aio.componente, specs: aio.componente.specs.receptor };
  return undefined;
}
