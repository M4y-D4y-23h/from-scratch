import type { CentsRange } from "@/domain/core/money";
import type { Source } from "@/domain/core/source";
import type { VerificationStatus } from "@/domain/core/verification";

import { type Build, type BuildItem, firstOf, GROUND_CATEGORIES, itemsOf, vtxOf } from "./build";
import type { CostReport } from "./costs";
import {
  type Archetype,
  type Component,
  type ComponentCategory,
  type Firmware,
  parseMountPattern,
  type WhereToBuy,
} from "./schema";
import { SRC } from "./sources";

/*
 * Cena 3D do drone (SPEC B.11): o domínio descreve em JSON, em milímetros reais, o que desenhar; a
 * UI (src/components/viewer3d) só transforma o JSON em malhas. Nenhum cálculo de engenharia usa a
 * cena: ela mostra o projeto, não decide nada.
 *
 * Eixos (os mesmos do three.js): X para a direita do drone, Y para cima, Z para trás. A frente
 * aponta para −Z; a câmera padrão fica atrás e acima, como o piloto vê o drone.
 *
 * Medidas: vêm do catálogo (entre-eixos, diâmetro da hélice, dimensões de bateria, FC, câmera...).
 * Quando o fabricante não publica uma medida, a forma sai de outra informação (ex.: o sino do motor
 * a partir do estator) e o nó leva `aproximado` com o motivo, que o painel da peça mostra.
 */

export type Vec3 = [number, number, number];
export type SpinDirection = "horario" | "anti_horario";
export type MotorCorner = "frente_direita" | "frente_esquerda" | "tras_direita" | "tras_esquerda";

/** Formas básicas. Cilindros, anéis e hélices nascem no eixo Y (em pé). */
export type SceneShape =
  | { tipo: "caixa"; tamanho: Vec3 }
  | { tipo: "cilindro"; raio: number; altura: number }
  | { tipo: "anel"; raio_interno: number; raio_externo: number; altura: number }
  | { tipo: "helice"; raio: number; pas: number };

export const SCENE_MATERIALS = [
  "carbono",
  "plastico",
  "metal",
  "placa",
  "bateria",
  "helice",
  "fita",
  "camera",
  "antena",
  "gps",
  "conector",
  "canopy",
] as const;
export type SceneMaterial = (typeof SCENE_MATERIALS)[number];

export type SceneNode = {
  id: string;
  /** Peça do catálogo que o nó representa (o clique abre o painel dela). */
  componente_id?: string;
  categoria?: ComponentCategory;
  rotulo: string;
  forma: SceneShape;
  material: SceneMaterial;
  /** Centro da forma (mm). */
  posicao: Vec3;
  /** Rotação em radianos, ordem XYZ (a mesma do three.js). */
  rotacao?: Vec3;
  /** Deslocamento na vista explodida com o controle no máximo (mm). */
  explosao: Vec3;
  /** Por que a forma ou a posição é aproximada (o fabricante não publica a medida). */
  aproximado?: string;
  /** Informação extra para o painel (ex.: o strap vem com o frame?). */
  nota?: string;
  /** Hélice: sentido de giro (a UI pode animar). */
  gira?: SpinDirection;
};

/** Fiação simplificada (SPEC B.11): vermelho/preto para potência, cores para sinal (na UI). */
export const WIRE_KINDS = [
  "positivo",
  "negativo",
  "motor",
  "sinal_motor",
  "radio",
  "video",
  "gps",
] as const;
export type WireKind = (typeof WIRE_KINDS)[number];
export type SceneWire = { id: string; tipo: WireKind; pontos: Vec3[] };

export type MotorMarker = {
  canto: MotorCorner;
  /** Número do motor no firmware (ausente se a ordem do firmware não foi conferida). */
  numero?: number;
  sentido: SpinDirection;
  /** Centro do motor, na altura da hélice. */
  centro: Vec3;
  /** Raio da seta de giro (mm). */
  raio: number;
};

export type SceneMeasure = {
  id: string;
  rotulo: string;
  valor_mm: number;
  de: Vec3;
  ate: Vec3;
  selo: VerificationStatus;
};

export type DroneScene = {
  versao: 1;
  unidade: "mm";
  arquetipo_id: string;
  firmware: Firmware;
  nos: SceneNode[];
  fios: SceneWire[];
  motores: MotorMarker[];
  medidas: SceneMeasure[];
  frente: { origem: Vec3; direcao: Vec3; comprimento: number };
  /** Caixa que envolve o drone montado (para enquadrar a câmera). */
  limites: { min: Vec3; max: Vec3 };
  /** O que o usuário precisa saber sobre o desenho (geometria aproximada etc.). */
  avisos: string[];
  /** Fontes da ordem e do sentido dos motores. */
  fontes: Source[];
};

// ---------------------------------------------------------------------------
// Motores: ordem e sentido de giro
// ---------------------------------------------------------------------------

/**
 * Sentido de giro visto de cima. ArduPilot Quad X (AP_MotorsMatrix.cpp) e Betaflight Quad X no
 * padrão "props in" (o que os guias usam) giram igual em cada canto; muda só a numeração.
 */
const SPIN: Record<MotorCorner, SpinDirection> = {
  frente_direita: "anti_horario",
  frente_esquerda: "horario",
  tras_direita: "horario",
  tras_esquerda: "anti_horario",
};

const MOTOR_NUMBER: Partial<Record<Firmware, Record<MotorCorner, number>>> = {
  ArduPilot: { frente_direita: 1, tras_esquerda: 2, frente_esquerda: 3, tras_direita: 4 },
  Betaflight: { tras_direita: 1, frente_direita: 2, tras_esquerda: 3, frente_esquerda: 4 },
};

const MOTOR_SOURCES: Partial<Record<Firmware, Source>> = {
  ArduPilot: SRC.ardupilotMotorOrder,
  Betaflight: SRC.betaflightMotorDirection,
};

const CORNER_LABEL: Record<MotorCorner, string> = {
  frente_direita: "frente, direita",
  frente_esquerda: "frente, esquerda",
  tras_direita: "trás, direita",
  tras_esquerda: "trás, esquerda",
};

/** Sinal de X e Z de cada canto (frente = −Z, direita = +X). */
const CORNER_SIGN: Record<MotorCorner, [number, number]> = {
  frente_direita: [1, -1],
  frente_esquerda: [-1, -1],
  tras_direita: [1, 1],
  tras_esquerda: [-1, 1],
};
const CORNERS = Object.keys(CORNER_SIGN) as MotorCorner[];

// ---------------------------------------------------------------------------
// Heurísticas de desenho (só quando o catálogo não tem a medida; sempre marcadas)
// ---------------------------------------------------------------------------

const INCH_MM = 25.4;
const DESENHO = {
  /** Sino do motor ≈ 1,27 × o diâmetro do estator; altura ≈ estator + 0,55 × o diâmetro. */
  sino_por_estator: 1.27,
  altura_extra_por_diametro: 0.55,
  /** Placa de FC/ESC: furação + 6 mm de borda (20 x 20 → 26 mm). */
  borda_placa_mm: 6,
  espessura_pcb_mm: 1.6,
  /** Placa central: pelo menos 28% do entre-eixos (o X500 V2 tem 144 mm para 500 mm). */
  placa_por_entre_eixos: 0.28,
  /** Largura do braço ≈ 4,5% do entre-eixos (entre 3 e 20 mm). */
  braco_por_entre_eixos: 0.045,
  /** Espessura da placa ≈ 0,8% do entre-eixos (entre 1,2 e 4 mm). */
  placa_espessura_por_entre_eixos: 0.008,
  antena_video_mm: 45,
  antena_radio_mm: 40,
  /** Vista explodida: deslocamento base = 25% do entre-eixos. */
  explosao_por_entre_eixos: 0.25,
} as const;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const deg = (d: number) => (d * Math.PI) / 180;
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const fmt = (n: number, casas = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });

/** Direção do eixo Y de um objeto girado por [θx, 0, θz] (ordem XYZ do three.js). */
function upAfter(rot: Vec3): Vec3 {
  const [tx, , tz] = rot;
  return [-Math.sin(tz), Math.cos(tz) * Math.cos(tx), Math.cos(tz) * Math.sin(tx)];
}

/** Haste (antena, mastro) que sai de `base` na direção de `rot`. */
function rodCenter(base: Vec3, rot: Vec3, comprimento: number): Vec3 {
  return add(base, scale(upAfter(rot), comprimento / 2));
}

type Dims = { comprimento: number; largura: number; altura: number };

function name(c: Component): string {
  return `${c.marca} ${c.modelo}`;
}

/** Espaçamento (mm) da primeira furação retangular da lista. */
function mountSpacing(patterns: readonly string[] | undefined): number | undefined {
  for (const p of patterns ?? []) {
    const parsed = parseMountPattern(p);
    if (parsed?.tipo === "retangular") return Math.max(parsed.a, parsed.b);
    if (parsed?.tipo === "circular") return parsed.diametro;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Cena
// ---------------------------------------------------------------------------

export function buildDroneScene(build: Build, archetype: Pick<Archetype, "firmware">): DroneScene {
  const nos: SceneNode[] = [];
  const fios: SceneWire[] = [];
  const avisos: string[] = [];
  const firmware = archetype.firmware;

  const frame = firstOf(build, "frame")?.componente;
  const fs = frame?.specs;
  const prop = firstOf(build, "helice")?.componente;
  const motor = firstOf(build, "motor")?.componente;

  // ---- Tamanho: entre-eixos e hélice ----
  const propDiam = prop?.specs.diametro_pol ? prop.specs.diametro_pol * INCH_MM : undefined;
  let entreEixos = fs?.distancia_entre_eixos_mm;
  if (!entreEixos) {
    entreEixos = (propDiam ?? 127) * 2.2;
    avisos.push(
      "O frame não informa o entre-eixos: a posição dos motores foi estimada pelo tamanho da hélice.",
    );
  }
  const propR = (propDiam ?? entreEixos / 2.2) / 2;
  const u = entreEixos * DESENHO.explosao_por_entre_eixos;
  const geometria = fs?.geometria ?? "X";
  const motorAprox =
    geometria === "X" || geometria === "true-X"
      ? undefined
      : `Geometria ${geometria}: a posição dos motores foi desenhada como X a partir do entre-eixos de ${fmt(entreEixos)} mm (o fabricante não publica as coordenadas).`;
  if (motorAprox) avisos.push(motorAprox);

  const whoop = fs?.protecao_helices === true;
  const tPlacaDado = fs?.espessura_placa_mm ?? fs?.espessura_braco_mm;
  const tPlaca = tPlacaDado ?? clamp(entreEixos * DESENHO.placa_espessura_por_entre_eixos, 1.2, 4);
  const tBraco = fs?.espessura_braco_mm ?? tPlaca;
  const larguraBraco = clamp(entreEixos * DESENHO.braco_por_entre_eixos, 3, 20);

  // ---- Controladora: FC avulsa, stack ou AIO ----
  const fcItem = firstOf(build, "fc");
  const stackItem = firstOf(build, "stack");
  const aioItem = firstOf(build, "fc_aio");
  const placaFcSpacing = stackItem
    ? mountSpacing(stackItem.componente.specs.fc.furacao)
    : aioItem
      ? mountSpacing(aioItem.componente.specs.fc.furacao)
      : fcItem && !fcItem.componente.dimensoes_mm
        ? mountSpacing(fcItem.componente.specs.furacao)
        : undefined;
  const ladoPlacaFc = placaFcSpacing ? placaFcSpacing + DESENHO.borda_placa_mm : undefined;
  const fcDims: Dims | undefined = fcItem?.componente.dimensoes_mm;

  // ---- Placa central ----
  const conteudo = Math.max(fcDims?.comprimento ?? 0, ladoPlacaFc ?? 0);
  const placa = fs?.placa_central_mm ?? {
    comprimento: Math.max(entreEixos * DESENHO.placa_por_entre_eixos, conteudo + (whoop ? 4 : 20)),
    largura: Math.max(
      entreEixos * DESENHO.placa_por_entre_eixos,
      (fcDims?.largura ?? ladoPlacaFc ?? 0) + (whoop ? 4 : 20),
    ),
  };
  const placaAprox = fs?.placa_central_mm
    ? undefined
    : "Tamanho da placa central desenhado a partir do entre-eixos e da controladora.";

  // Altura entre as placas: dado do frame ou o que cabe a controladora.
  const alturaConteudo = fcDims
    ? 0
    : stackItem
      ? 4 + 2 * DESENHO.espessura_pcb_mm + 8
      : DESENHO.espessura_pcb_mm + 3;
  const espaco = fs?.espaco_entre_placas_mm ?? Math.max(alturaConteudo + 6, whoop ? 0 : 14);
  const yBaixoTopo = tPlaca;
  const temPlacaDeCima = !whoop;
  const yCimaCentro = yBaixoTopo + espaco + tPlaca / 2;
  const yCimaTopo = temPlacaDeCima ? yCimaCentro + tPlaca / 2 : yBaixoTopo;
  const frameId = frame?.id;

  if (frame) {
    nos.push({
      id: "frame-placa-baixo",
      componente_id: frameId,
      categoria: "frame",
      rotulo: `${name(frame)}: placa de baixo`,
      forma: { tipo: "caixa", tamanho: [placa.largura, tPlaca, placa.comprimento] },
      material: frameMaterial(frame),
      posicao: [0, tPlaca / 2, 0],
      explosao: [0, 0, 0],
      aproximado: placaAprox,
    });
    if (temPlacaDeCima) {
      nos.push({
        id: "frame-placa-cima",
        componente_id: frameId,
        categoria: "frame",
        rotulo: `${name(frame)}: placa de cima`,
        forma: { tipo: "caixa", tamanho: [placa.largura, tPlaca, placa.comprimento] },
        material: frameMaterial(frame),
        posicao: [0, yCimaCentro, 0],
        explosao: [0, 1.2 * u, 0],
        aproximado: placaAprox,
      });
    }
  }

  // ---- Motores, braços, hélices, dutos ----
  const motorDims = motorShape(motor, propR);
  const yMotorBase = tBraco;
  const yHelice = yMotorBase + motorDims.altura + 3;
  const motores: MotorMarker[] = [];
  const numeros = MOTOR_NUMBER[firmware];
  if (!numeros) avisos.push(`A numeração dos motores do ${firmware} ainda não foi conferida.`);
  const offset = (entreEixos / 2) * Math.SQRT1_2;
  const posMotor: Record<MotorCorner, Vec3> = {} as Record<MotorCorner, Vec3>;

  for (const canto of CORNERS) {
    const [sx, sz] = CORNER_SIGN[canto];
    const x = sx * offset;
    const z = sz * offset;
    posMotor[canto] = [x, yMotorBase, z];
    const fora = scale([sx * Math.SQRT1_2, 0, sz * Math.SQRT1_2], 0.3 * u);
    const numero = numeros?.[canto];
    const rotuloMotor = `Motor ${numero ?? ""} (${CORNER_LABEL[canto]})`.replace("  ", " ");
    const ang = Math.atan2(x, z);

    if (frame && !whoop) {
      nos.push({
        id: `frame-braco-${canto}`,
        componente_id: frameId,
        categoria: "frame",
        rotulo: `${name(frame)}: braço (${CORNER_LABEL[canto]})`,
        forma: { tipo: "caixa", tamanho: [larguraBraco, tBraco, entreEixos / 2] },
        material: frameMaterial(frame),
        posicao: [x / 2, tBraco / 2, z / 2],
        rotacao: [0, ang, 0],
        explosao: scale(fora, 1.5),
        aproximado: motorAprox ?? "Largura do braço desenhada a partir do entre-eixos.",
      });
    }
    if (frame && whoop) {
      const alturaDuto = frame.dimensoes_mm?.altura ?? 12;
      nos.push({
        id: `frame-duto-${canto}`,
        componente_id: frameId,
        categoria: "frame",
        rotulo: `${name(frame)}: duto da hélice (${CORNER_LABEL[canto]})`,
        forma: {
          tipo: "anel",
          raio_interno: propR + 1.2,
          raio_externo: propR + 2.2,
          altura: alturaDuto,
        },
        material: frameMaterial(frame),
        posicao: [x, alturaDuto / 2, z],
        explosao: [0, 0, 0],
        aproximado: "Espessura da parede do duto desenhada (a altura é a do frame).",
      });
      nos.push({
        id: `frame-braco-${canto}`,
        componente_id: frameId,
        categoria: "frame",
        rotulo: `${name(frame)}: braço (${CORNER_LABEL[canto]})`,
        forma: { tipo: "caixa", tamanho: [larguraBraco, tBraco, entreEixos / 2] },
        material: frameMaterial(frame),
        posicao: [x / 2, tBraco / 2, z / 2],
        rotacao: [0, ang, 0],
        explosao: [0, 0, 0],
        aproximado: "Braço desenhado a partir do entre-eixos.",
      });
    }
    if (motor) {
      nos.push({
        id: `motor-${canto}`,
        componente_id: motor.id,
        categoria: "motor",
        rotulo: rotuloMotor,
        forma: { tipo: "cilindro", raio: motorDims.diametro / 2, altura: motorDims.altura },
        material: "metal",
        posicao: [x, yMotorBase + motorDims.altura / 2, z],
        explosao: add([0, 1.5 * u, 0], fora),
        aproximado: motorDims.aproximado,
      });
    }
    if (prop && propDiam) {
      nos.push({
        id: `helice-${canto}`,
        componente_id: prop.id,
        categoria: "helice",
        rotulo: `Hélice (${CORNER_LABEL[canto]}): gira ${SPIN[canto] === "horario" ? "no sentido horário" : "no sentido anti-horário"}`,
        forma: { tipo: "helice", raio: propDiam / 2, pas: prop.specs.pas ?? 2 },
        material: "helice",
        posicao: [x, yHelice, z],
        explosao: add([0, 3 * u, 0], fora),
        gira: SPIN[canto],
      });
    }
    motores.push({
      canto,
      numero,
      sentido: SPIN[canto],
      centro: [x, yHelice + 2, z],
      raio: Math.max(propR * 0.55, 4),
    });
  }

  // ESCs individuais no braço (Arquétipo 1: ESC de cada motor no braço do X500).
  const escs = itemsOf(build, "esc");
  if (escs[0]) {
    const esc = escs[0].componente;
    const d = esc.dimensoes_mm;
    for (const canto of CORNERS) {
      const [mx, , mz] = posMotor[canto];
      const numero = numeros?.[canto];
      nos.push({
        id: `esc-${canto}`,
        componente_id: esc.id,
        categoria: "esc",
        rotulo: `ESC do motor ${numero ?? ""} (${CORNER_LABEL[canto]})`.replace("  ", " "),
        forma: {
          tipo: "caixa",
          tamanho: [d?.largura ?? 14, d?.altura ?? 5, d?.comprimento ?? 26],
        },
        material: "placa",
        posicao: [mx * 0.55, tBraco + (d?.altura ?? 5) / 2 + 0.5, mz * 0.55],
        rotacao: [0, Math.atan2(mx, mz), 0],
        explosao: scale([Math.sign(mx), 0.5, Math.sign(mz)], 0.4 * u),
        aproximado: d ? "Posição no braço ilustrativa." : "ESC sem medidas no catálogo.",
      });
    }
  }

  // ---- Controladora ----
  let fcCentro: Vec3 = [0, yBaixoTopo + 3, 0];
  let escCentro: Vec3 | undefined;
  if (fcItem && fcDims) {
    // FC no padrão Pixhawk: presa com espuma em cima da placa de cima (ou da de baixo).
    const base = fs?.fixacao_fc_fita && temPlacaDeCima ? yCimaTopo : yBaixoTopo;
    fcCentro = [0, base + 3 + fcDims.altura / 2, 0];
    nos.push({
      id: "controladora",
      componente_id: fcItem.componente.id,
      categoria: "fc",
      rotulo: `${name(fcItem.componente)} (controladora)`,
      forma: { tipo: "caixa", tamanho: [fcDims.largura, fcDims.altura, fcDims.comprimento] },
      material: "plastico",
      posicao: fcCentro,
      explosao: [0, 2 * u, 0],
    });
  } else if (stackItem && ladoPlacaFc && placaFcSpacing) {
    const c = stackItem.componente;
    const yEsc = yBaixoTopo + 4 + DESENHO.espessura_pcb_mm / 2;
    const yFc = yEsc + 8;
    escCentro = [0, yEsc, 0];
    fcCentro = [0, yFc, 0];
    const aprox = `Placas desenhadas com a furação de ${fmt(placaFcSpacing)} x ${fmt(placaFcSpacing)} mm + borda.`;
    nos.push({
      id: "stack-esc",
      componente_id: c.id,
      categoria: "stack",
      rotulo: `${name(c)}: placa de ESC (4 em 1)`,
      forma: {
        tipo: "caixa",
        tamanho: [ladoPlacaFc, DESENHO.espessura_pcb_mm, ladoPlacaFc],
      },
      material: "placa",
      posicao: escCentro,
      explosao: [0, 0.6 * u, 0],
      aproximado: aprox,
    });
    nos.push({
      id: "stack-fc",
      componente_id: c.id,
      categoria: "stack",
      rotulo: `${name(c)}: controladora`,
      forma: {
        tipo: "caixa",
        tamanho: [ladoPlacaFc, DESENHO.espessura_pcb_mm, ladoPlacaFc],
      },
      material: "placa",
      posicao: fcCentro,
      explosao: [0, 1 * u, 0],
      aproximado: aprox,
    });
    const h = yFc - yBaixoTopo + 2;
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      nos.push({
        id: `stack-espacador-${sx}-${sz}`,
        componente_id: c.id,
        categoria: "stack",
        rotulo: `Espaçador da stack (furação ${fmt(placaFcSpacing)} x ${fmt(placaFcSpacing)} mm)`,
        forma: { tipo: "cilindro", raio: 1.5, altura: h },
        material: "metal",
        posicao: [(sx * placaFcSpacing) / 2, yBaixoTopo + h / 2, (sz * placaFcSpacing) / 2],
        explosao: [0, 0.8 * u, 0],
      });
    }
  } else if (fcItem && ladoPlacaFc) {
    // FC sem medidas publicadas: placa desenhada pela furação.
    fcCentro = [0, yBaixoTopo + 6 + DESENHO.espessura_pcb_mm / 2, 0];
    nos.push({
      id: "controladora",
      componente_id: fcItem.componente.id,
      categoria: "fc",
      rotulo: `${name(fcItem.componente)} (controladora)`,
      forma: { tipo: "caixa", tamanho: [ladoPlacaFc, DESENHO.espessura_pcb_mm, ladoPlacaFc] },
      material: "placa",
      posicao: fcCentro,
      explosao: [0, 1 * u, 0],
      aproximado: `Placa desenhada com a furação de ${fmt(placaFcSpacing ?? 0)} mm + borda.`,
    });
  } else if (aioItem && ladoPlacaFc) {
    const c = aioItem.componente;
    fcCentro = [0, yBaixoTopo + 2 + DESENHO.espessura_pcb_mm / 2, 0];
    escCentro = fcCentro;
    nos.push({
      id: "aio",
      componente_id: c.id,
      categoria: "fc_aio",
      rotulo: `${name(c)} (placa tudo em um)`,
      forma: {
        tipo: "caixa",
        tamanho: [ladoPlacaFc, DESENHO.espessura_pcb_mm, ladoPlacaFc],
      },
      material: "placa",
      posicao: fcCentro,
      explosao: [0, 0.8 * u, 0],
      aproximado: `Placa desenhada com a furação de ${fmt(placaFcSpacing ?? 0)} mm + borda.`,
    });
  }

  // ---- Bateria (e strap) ----
  // Convenção de desenho: whoop, no encaixe; drone com trem de pouso, embaixo; FPV, em cima.
  const bat = firstOf(build, "bateria")?.componente;
  let batConector: Vec3 | undefined;
  let topoBateria: number | undefined;
  const bateriaEmCima =
    bat !== undefined && fs?.slot_bateria_mm === undefined && fs?.trem_de_pouso !== true;
  if (bat) {
    const d = bat.dimensoes_mm;
    const comp = d?.comprimento ?? Math.max(placa.comprimento * 0.8, 20);
    const larg = d?.largura ?? Math.max(placa.largura * 0.35, 8);
    const alt = d?.altura ?? Math.max(larg * 0.6, 5);
    const noSlot = fs?.slot_bateria_mm !== undefined;
    const embaixo = !bateriaEmCima;
    const y = embaixo ? -(alt / 2) - (noSlot ? 0.5 : 4) : yCimaTopo + alt / 2;
    const pos: Vec3 = [0, y, 0];
    batConector = [0, y, comp / 2];
    if (!embaixo) topoBateria = y + alt / 2;
    nos.push({
      id: "bateria",
      componente_id: bat.id,
      categoria: "bateria",
      rotulo: name(bat),
      forma: { tipo: "caixa", tamanho: [larg, alt, comp] },
      material: "bateria",
      posicao: pos,
      explosao: [0, (embaixo ? -1.6 : 2.2) * u, 0],
      aproximado: d ? undefined : "Bateria sem medidas no catálogo: tamanho ilustrativo.",
    });
    if (!noSlot) {
      const yStrap = embaixo ? y - alt / 2 - 0.6 : y + alt / 2 + 0.6;
      nos.push({
        id: "strap-bateria",
        categoria: "strap",
        rotulo: "Strap (fita) que prende a bateria",
        forma: { tipo: "caixa", tamanho: [larg + 3, 1.2, Math.min(20, comp * 0.3)] },
        material: "fita",
        posicao: [0, yStrap, 0],
        explosao: [0, (embaixo ? -1.9 : 2.6) * u, 0],
        nota:
          fs?.straps_bateria && fs.straps_bateria > 0
            ? `Vem com o frame (${fs.straps_bateria} straps).`
            : "A lista de peças não tem strap: confira se o frame ou a bateria trazem.",
      });
    }
  }

  // ---- Trem de pouso: duas pernas e um esqui de cada lado ----
  if (frame && fs?.trem_de_pouso) {
    const alturaTotal = fs.altura_trem_de_pouso_mm ?? entreEixos * 0.4;
    const perna = Math.max(alturaTotal - (espaco + 2 * tPlaca), 20);
    const aprox = fs.altura_trem_de_pouso_mm
      ? `Formato simplificado; altura total de ${fmt(alturaTotal)} mm (fabricante).`
      : "Trem de pouso ilustrativo.";
    for (const sx of [1, -1]) {
      const lado = sx > 0 ? "direita" : "esquerda";
      const x = (sx * placa.largura) / 2 - sx * 8;
      const explosao: Vec3 = [sx * 0.8 * u, -0.8 * u, 0];
      for (const sz of [1, -1]) {
        nos.push({
          id: `frame-trem-${lado}-${sz > 0 ? "tras" : "frente"}`,
          componente_id: frameId,
          categoria: "frame",
          rotulo: `${name(frame)}: perna do trem de pouso (${lado})`,
          forma: { tipo: "cilindro", raio: 4, altura: perna },
          material: frameMaterial(frame),
          posicao: [x, -perna / 2, sz * placa.comprimento * 0.3],
          explosao,
          aproximado: aprox,
        });
      }
      nos.push({
        id: `frame-trem-${lado}-esqui`,
        componente_id: frameId,
        categoria: "frame",
        rotulo: `${name(frame)}: esqui do trem de pouso (${lado})`,
        forma: { tipo: "cilindro", raio: 4, altura: placa.comprimento * 1.3 },
        material: frameMaterial(frame),
        posicao: [x, -perna, 0],
        rotacao: [Math.PI / 2, 0, 0],
        explosao,
        aproximado: aprox,
      });
    }
  }

  // ---- GPS no mastro ----
  const gps = firstOf(build, "gps")?.componente;
  const mastroItem = firstOf(build, "mastro_gps")?.componente;
  let gpsCentro: Vec3 | undefined;
  let mastroAltura: number | undefined;
  const mastroBase: Vec3 = [0, yCimaTopo, placa.comprimento * 0.3];
  if (gps) {
    mastroAltura = fs?.mastro_gps_mm ?? mastroItem?.specs.altura_mm;
    const altMastro = mastroAltura ?? 40;
    const d = gps.dimensoes_mm;
    const disco = d !== undefined && Math.abs(d.comprimento - d.largura) < 1;
    const alt = d?.altura ?? 12;
    gpsCentro = [mastroBase[0], mastroBase[1] + altMastro + alt / 2, mastroBase[2]];
    nos.push({
      id: "mastro-gps",
      componente_id: mastroItem?.id ?? (fs?.mastro_gps_mm ? frameId : undefined),
      categoria: mastroItem ? "mastro_gps" : "frame",
      rotulo: `Mastro do GPS (${fmt(altMastro)} mm)`,
      forma: { tipo: "cilindro", raio: 4, altura: altMastro },
      material: "carbono",
      posicao: [mastroBase[0], mastroBase[1] + altMastro / 2, mastroBase[2]],
      explosao: [0, 2 * u, 0.3 * u],
      aproximado: mastroAltura ? undefined : "Sem mastro no projeto: altura ilustrativa.",
    });
    nos.push({
      id: "gps",
      componente_id: gps.id,
      categoria: "gps",
      rotulo: `${name(gps)} (GPS com bússola)`,
      forma: disco
        ? { tipo: "cilindro", raio: d.largura / 2, altura: alt }
        : { tipo: "caixa", tamanho: [d?.largura ?? 30, alt, d?.comprimento ?? 30] },
      material: "gps",
      posicao: gpsCentro,
      explosao: [0, 2.6 * u, 0.3 * u],
      aproximado: d ? undefined : "GPS sem medidas no catálogo.",
    });
  }

  // ---- Câmera, VTX, receptor e antenas ----
  const camera = firstOf(build, "camera_fpv")?.componente;
  let cameraCentro: Vec3 | undefined;
  if (camera) {
    const d = camera.dimensoes_mm;
    const lados = d ? [d.comprimento, d.largura, d.altura].sort((a, b) => a - b) : [12, 12, 14];
    const [a = 12, b = 12, prof = 14] = lados;
    const y = whoop
      ? fcCentro[1] + a / 2 + 2
      : (yBaixoTopo + (temPlacaDeCima ? yCimaCentro : 0)) / 2 + 2;
    cameraCentro = [0, Math.max(y, a / 2), -placa.comprimento / 2 - prof / 2 + (whoop ? 6 : 4)];
    nos.push({
      id: "camera",
      componente_id: camera.id,
      categoria: "camera_fpv",
      rotulo: `${name(camera)} (câmera FPV)`,
      forma: { tipo: "caixa", tamanho: [b, a, prof] },
      material: "camera",
      posicao: cameraCentro,
      explosao: [0, 0.3 * u, -1.2 * u],
      aproximado: d ? undefined : "Câmera sem medidas no catálogo.",
    });
  }

  const vtx = vtxOf(build);
  let vtxCentro: Vec3 | undefined;
  if (vtx && !vtx.integrado) {
    const c = vtx.componente;
    const d = c.dimensoes_mm;
    const lado = d?.largura ?? 25;
    const alt = d?.altura ?? 4;
    // Com a bateria em cima (FPV), o VTX vai entre as placas, em cima da stack.
    vtxCentro = bateriaEmCima
      ? [0, yCimaCentro - tPlaca / 2 - alt / 2 - 1, placa.comprimento / 2 - lado / 2 - 2]
      : [placa.largura / 4, yCimaTopo + alt / 2 + 0.5, placa.comprimento / 2 - lado / 2 - 2];
    nos.push({
      id: "vtx",
      componente_id: c.id,
      categoria: "vtx",
      rotulo: `${name(c)} (transmissor de vídeo)`,
      forma: { tipo: "caixa", tamanho: [lado, d?.altura ?? 4, d?.comprimento ?? 25] },
      material: "placa",
      posicao: vtxCentro,
      explosao: [0, 1.6 * u, 1.2 * u],
      aproximado: d ? "Posição ilustrativa (na parte de trás)." : "VTX sem medidas.",
    });
  } else if (vtx?.integrado) {
    vtxCentro = fcCentro;
  }

  const antena = firstOf(build, "antena")?.componente;
  if (antena && vtxCentro) {
    const rot: Vec3 = [deg(35), 0, 0];
    const base: Vec3 = [vtxCentro[0], vtxCentro[1] + 2, vtxCentro[2] + (vtx?.integrado ? 8 : 12)];
    const comp = whoop ? DESENHO.antena_video_mm * 0.5 : DESENHO.antena_video_mm;
    nos.push({
      id: "antena-video",
      componente_id: antena.id,
      categoria: "antena",
      rotulo: `${name(antena)} (antena de vídeo)`,
      forma: { tipo: "cilindro", raio: whoop ? 0.6 : 2.5, altura: comp },
      material: "antena",
      posicao: rodCenter(base, rot, comp),
      rotacao: rot,
      explosao: [0, 1.8 * u, 1.6 * u],
      aproximado: "Comprimento da antena ilustrativo.",
    });
  }

  const rx = firstOf(build, "receptor")?.componente;
  let rxCentro: Vec3 | undefined;
  if (rx) {
    const d = rx.dimensoes_mm;
    const alt = d?.altura ?? 4;
    rxCentro = [
      -placa.largura / 4,
      bateriaEmCima ? yBaixoTopo + alt / 2 + 0.5 : yCimaTopo + alt / 2 + 0.5,
      placa.comprimento / 2 - (d?.comprimento ?? 20) / 2 - 2,
    ];
    nos.push({
      id: "receptor",
      componente_id: rx.id,
      categoria: "receptor",
      rotulo: `${name(rx)} (receptor do rádio)`,
      forma: {
        tipo: "caixa",
        tamanho: [d?.largura ?? 13, d?.altura ?? 4, d?.comprimento ?? 20],
      },
      material: "placa",
      posicao: rxCentro,
      explosao: [-0.8 * u, 1.4 * u, 1 * u],
      aproximado: d ? "Posição ilustrativa." : "Receptor sem medidas.",
    });
    for (const lado of [1, -1]) {
      const rot: Vec3 = [deg(40), 0, deg(lado * 35)];
      const base: Vec3 = [rxCentro[0], rxCentro[1] + 2, rxCentro[2] + 4];
      nos.push({
        id: `receptor-antena-${lado > 0 ? "a" : "b"}`,
        componente_id: rx.id,
        categoria: "receptor",
        rotulo: `${name(rx)}: antena (em V)`,
        forma: { tipo: "cilindro", raio: 0.8, altura: DESENHO.antena_radio_mm },
        material: "antena",
        posicao: rodCenter(base, rot, DESENHO.antena_radio_mm),
        rotacao: rot,
        explosao: [-0.8 * u, 1.6 * u, 1.2 * u],
        aproximado: "Comprimento das antenas ilustrativo.",
      });
    }
  }

  // ---- Energia: PDB, módulo de energia, conector, capacitor ----
  let entradaEnergia: Vec3 = escCentro ?? fcCentro;
  for (const item of itemsOf(build, "modulo_energia")) {
    const c = item.componente;
    if (c.specs.pdb) {
      const pos: Vec3 = [0, yBaixoTopo + 0.8, 0];
      entradaEnergia = pos;
      nos.push({
        id: `energia-${c.id}`,
        componente_id: c.id,
        categoria: "modulo_energia",
        rotulo: `${name(c)} (distribui a energia da bateria)`,
        forma: {
          tipo: "caixa",
          tamanho: [placa.largura * 0.55, DESENHO.espessura_pcb_mm, placa.comprimento * 0.55],
        },
        material: "placa",
        posicao: pos,
        explosao: [0, -0.5 * u, 0],
        aproximado: "Placa de distribuição desenhada sobre a placa de baixo.",
      });
    } else {
      const pos: Vec3 = [placa.largura / 4, yBaixoTopo + 6, placa.comprimento / 2 - 12];
      entradaEnergia = pos;
      nos.push({
        id: `energia-${c.id}`,
        componente_id: c.id,
        categoria: "modulo_energia",
        rotulo: `${name(c)} (mede a bateria e alimenta a controladora)`,
        forma: { tipo: "caixa", tamanho: [22, 8, 34] },
        material: "placa",
        posicao: pos,
        explosao: [1 * u, 0, 1 * u],
        aproximado: "O fabricante não publica as medidas em texto: tamanho ilustrativo.",
      });
    }
  }
  const conector = firstOf(build, "conector")?.componente;
  if (conector) {
    const pos: Vec3 = [0, yBaixoTopo + 6, placa.comprimento / 2 + 14];
    nos.push({
      id: "conector-bateria",
      componente_id: conector.id,
      categoria: "conector",
      rotulo: `${name(conector)} (onde a bateria encaixa)`,
      forma: { tipo: "caixa", tamanho: [16, 8, 16] },
      material: "conector",
      posicao: pos,
      explosao: [0, 0, 1.4 * u],
      aproximado: "Item genérico: tamanho ilustrativo.",
    });
    if (bat) batConector = pos;
  }
  for (const item of itemsOf(build, "consumivel")) {
    const c = item.componente;
    nos.push({
      id: `consumivel-${c.id}`,
      componente_id: c.id,
      categoria: "consumivel",
      rotulo: name(c),
      forma: { tipo: "cilindro", raio: 5, altura: 20 },
      material: "conector",
      posicao: [12, yBaixoTopo + 5, placa.comprimento / 2 - 4],
      rotacao: [0, 0, deg(90)],
      explosao: [0.8 * u, 0.2 * u, 1.2 * u],
      aproximado: "Item genérico: tamanho ilustrativo.",
    });
  }
  const canopy = firstOf(build, "acessorio")?.componente;
  if (canopy) {
    const lado = (ladoPlacaFc ?? placa.largura) + 4;
    nos.push({
      id: "canopy",
      componente_id: canopy.id,
      categoria: "acessorio",
      rotulo: `${name(canopy)} (protege a placa e segura a câmera)`,
      forma: { tipo: "caixa", tamanho: [lado, 12, lado + 6] },
      material: "canopy",
      posicao: [0, fcCentro[1] + 7, -2],
      explosao: [0, 1.6 * u, 0],
      aproximado: "Forma simplificada do canopy.",
    });
  }

  // ---- Qualquer outra peça que voa (sem regra de desenho própria) ----
  const desenhadas = new Set(nos.map((n) => n.componente_id).filter(Boolean));
  let extra = 0;
  for (const item of flyingItems(build)) {
    if (desenhadas.has(item.componente.id)) continue;
    const c = item.componente;
    nos.push({
      id: `outra-${c.id}`,
      componente_id: c.id,
      categoria: c.categoria,
      rotulo: name(c),
      forma: { tipo: "caixa", tamanho: [14, 6, 14] },
      material: "placa",
      posicao: [placa.largura / 2 - 10, yCimaTopo + 4 + extra * 8, -placa.comprimento / 4],
      explosao: [1.2 * u, 1 * u, 0],
      aproximado: "Posição e tamanho ilustrativos.",
    });
    extra++;
  }

  // ---- Fiação simplificada ----
  if (bat && batConector) {
    for (const [tipo, dx] of [
      ["positivo", 2],
      ["negativo", -2],
    ] as const) {
      fios.push({
        id: `bateria-${tipo}`,
        tipo,
        pontos: [
          add(batConector, [dx, 0, 0]),
          add(batConector, [dx, 0, 8]),
          add(entradaEnergia, [dx, 0, 0]),
        ],
      });
    }
  }
  for (const canto of CORNERS) {
    const motorBase = posMotor[canto];
    const escNo = nos.find((n) => n.id === `esc-${canto}`);
    const origem = escNo ? escNo.posicao : (escCentro ?? fcCentro);
    fios.push({
      id: `motor-${canto}`,
      tipo: "motor",
      pontos: [origem, [motorBase[0], motorBase[1] + 1, motorBase[2]]],
    });
    if (escNo) {
      fios.push({ id: `sinal-${canto}`, tipo: "sinal_motor", pontos: [fcCentro, escNo.posicao] });
    }
  }
  if (rxCentro) fios.push({ id: "radio", tipo: "radio", pontos: [rxCentro, fcCentro] });
  if (gpsCentro) {
    fios.push({
      id: "gps",
      tipo: "gps",
      pontos: [add(gpsCentro, [0, -6, 0]), mastroBase, fcCentro],
    });
  }
  if (cameraCentro && vtxCentro) {
    const osd = firstOf(build, "stack")?.componente.specs.fc.osd_analogico;
    fios.push({
      id: "video",
      tipo: "video",
      pontos:
        osd && !vtx?.integrado ? [cameraCentro, fcCentro, vtxCentro] : [cameraCentro, vtxCentro],
    });
  }
  if (vtxCentro && vtx && !vtx.integrado) {
    for (const [tipo, dx] of [
      ["positivo", 1],
      ["negativo", -1],
    ] as const) {
      fios.push({
        id: `vtx-${tipo}`,
        tipo,
        pontos: [add(entradaEnergia, [dx, 0, 0]), add(vtxCentro, [dx, 0, 0])],
      });
    }
  }

  // ---- Medidas ----
  const medidas: SceneMeasure[] = [];
  const fl = posMotor.frente_esquerda;
  const rr = posMotor.tras_direita;
  medidas.push({
    id: "entre-eixos",
    rotulo: `Entre-eixos: ${fmt(entreEixos)} mm`,
    valor_mm: entreEixos,
    de: [fl[0], yHelice + 6, fl[2]],
    ate: [rr[0], yHelice + 6, rr[2]],
    selo: frame?.status_verificacao ?? "nao_verificado",
  });
  if (prop && propDiam) {
    const fr = posMotor.frente_direita;
    medidas.push({
      id: "helice",
      rotulo: `Hélice: ${fmt(prop.specs.diametro_pol ?? 0, 2)}" (${fmt(propDiam)} mm)`,
      valor_mm: propDiam,
      de: [fr[0] - propDiam / 2, yHelice + 2, fr[2]],
      ate: [fr[0] + propDiam / 2, yHelice + 2, fr[2]],
      selo: prop.status_verificacao,
    });
  }
  if (gpsCentro && mastroAltura) {
    medidas.push({
      id: "mastro-gps",
      rotulo: `Mastro do GPS: ${fmt(mastroAltura)} mm`,
      valor_mm: mastroAltura,
      de: [mastroBase[0] + 12, mastroBase[1], mastroBase[2]],
      ate: [mastroBase[0] + 12, mastroBase[1] + mastroAltura, mastroBase[2]],
      selo: frame?.status_verificacao ?? "nao_verificado",
    });
  }

  // ---- Frente e limites ----
  // A seta da frente passa por cima da bateria quando ela vai em cima (FPV).
  const frente = {
    origem: [
      0,
      Math.max(yCimaTopo, topoBateria ?? -Infinity) + 4,
      -placa.comprimento / 2 - 6,
    ] as Vec3,
    direcao: [0, 0, -1] as Vec3,
    comprimento: Math.max(entreEixos * 0.18, 20),
  };
  const fonteMotores = MOTOR_SOURCES[firmware];

  return {
    versao: 1,
    unidade: "mm",
    arquetipo_id: build.arquetipo_id,
    firmware,
    nos: nos.map(roundNode),
    fios: fios.map((f) => ({ ...f, pontos: f.pontos.map(roundVec) })),
    motores: motores.map((m) => ({ ...m, centro: roundVec(m.centro), raio: r1(m.raio) })),
    medidas: medidas.map((m) => ({ ...m, de: roundVec(m.de), ate: roundVec(m.ate) })),
    frente: { ...frente, origem: roundVec(frente.origem) },
    limites: boundsOf(nos),
    avisos,
    fontes: fonteMotores ? [fonteMotores] : [],
  };
}

function frameMaterial(frame: Component): SceneMaterial {
  return frame.categoria === "frame" && frame.specs.material === "fibra_de_carbono"
    ? "carbono"
    : "plastico";
}

/** Diâmetro e altura do motor: medida do fabricante ou derivada do estator ("2207"). */
function motorShape(
  motor: Component | undefined,
  propR: number,
): { diametro: number; altura: number; aproximado?: string } {
  const d = motor?.dimensoes_mm;
  if (d) return { diametro: d.largura, altura: d.altura };
  const estator = motor?.categoria === "motor" ? motor.specs.estator : undefined;
  if (estator) {
    const dd = Number(estator.slice(0, 2));
    const hh = Number(estator.slice(2));
    return {
      diametro: dd * DESENHO.sino_por_estator,
      altura: hh + dd * DESENHO.altura_extra_por_diametro,
      aproximado: `Desenhado a partir do estator ${estator} (${dd} mm x ${hh} mm): o fabricante não publica as medidas do sino.`,
    };
  }
  return {
    diametro: propR * 0.4,
    altura: propR * 0.3,
    aproximado: "Motor sem medidas no catálogo: tamanho ilustrativo.",
  };
}

/** Peças que voam (as que ficam no chão e os kits não entram na cena). */
export function flyingItems(build: Build): BuildItem[] {
  return build.itens.filter(
    (i) => !GROUND_CATEGORIES.has(i.componente.categoria) && i.componente.categoria !== "kit",
  );
}

function roundVec(v: Vec3): Vec3 {
  return [r1(v[0]), r1(v[1]), r1(v[2])];
}

function roundNode(n: SceneNode): SceneNode {
  const forma: SceneShape =
    n.forma.tipo === "caixa"
      ? { tipo: "caixa", tamanho: roundVec(n.forma.tamanho) }
      : n.forma.tipo === "cilindro"
        ? { tipo: "cilindro", raio: r1(n.forma.raio), altura: r1(n.forma.altura) }
        : n.forma.tipo === "anel"
          ? {
              tipo: "anel",
              raio_interno: r1(n.forma.raio_interno),
              raio_externo: r1(n.forma.raio_externo),
              altura: r1(n.forma.altura),
            }
          : { tipo: "helice", raio: r1(n.forma.raio), pas: n.forma.pas };
  return {
    ...n,
    forma,
    posicao: roundVec(n.posicao),
    explosao: roundVec(n.explosao),
    ...(n.rotacao ? { rotacao: n.rotacao.map((x) => Math.round(x * 1000) / 1000) as Vec3 } : {}),
  };
}

/** Metade da maior medida da forma (suficiente para enquadrar a câmera). */
function radiusOf(f: SceneShape): number {
  switch (f.tipo) {
    case "caixa":
      return Math.max(...f.tamanho) / 2;
    case "cilindro":
      return Math.max(f.raio, f.altura / 2);
    case "anel":
      return Math.max(f.raio_externo, f.altura / 2);
    case "helice":
      return f.raio;
  }
}

function boundsOf(nos: readonly SceneNode[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const n of nos) {
    const r = radiusOf(n.forma);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i] ?? Infinity, (n.posicao[i] ?? 0) - r);
      max[i] = Math.max(max[i] ?? -Infinity, (n.posicao[i] ?? 0) + r);
    }
  }
  if (nos.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min: roundVec(min), max: roundVec(max) };
}

/** Ids dos nós das peças destas categorias (ex.: as peças do passo atual do guia). */
export function nodesForCategories(scene: DroneScene, categorias: readonly string[]): string[] {
  const set = new Set(categorias);
  return scene.nos.filter((n) => n.categoria && set.has(n.categoria)).map((n) => n.id);
}

// ---------------------------------------------------------------------------
// Painel da peça (clique no 3D)
// ---------------------------------------------------------------------------

export type ScenePartInfo = {
  id: string;
  nome: string;
  categoria: ComponentCategory;
  descricao_leiga: string;
  quantidade_no_drone: number;
  quantidade_compra: number;
  preco?: CentsRange;
  /** Nome do produto em cuja caixa a peça vem (kit, VTX com antena...). */
  vem_com?: string;
  selo: VerificationStatus;
  onde_comprar: WhereToBuy[];
  massa_g?: number;
  massa_estimada: boolean;
  fontes: Source[];
};

/** Dados do painel de cada peça que aparece na cena (nome, função, preço, selo, onde comprar). */
export function scenePartsInfo(build: Build, custos: CostReport): Record<string, ScenePartInfo> {
  const linhas = new Map(custos.pecas.map((l) => [l.id, l]));
  const nomes = new Map(build.itens.map((i) => [i.componente.id, name(i.componente)]));
  const out: Record<string, ScenePartInfo> = {};
  for (const item of flyingItems(build)) {
    const c = item.componente;
    const linha = linhas.get(c.id);
    const vemCom = item.fornecido_por ? nomes.get(item.fornecido_por) : undefined;
    out[c.id] = {
      id: c.id,
      nome: name(c),
      categoria: c.categoria,
      descricao_leiga: c.descricao_leiga,
      quantidade_no_drone: item.quantidade_no_drone,
      quantidade_compra: item.quantidade_compra,
      preco: linha?.faixa,
      vem_com: vemCom ?? (item.fornecido_por ? item.fornecido_por : undefined),
      selo: c.status_verificacao,
      onde_comprar: c.onde_comprar,
      massa_g: c.massa_g ?? c.massa_estimada_g?.valor,
      massa_estimada: c.massa_g === undefined && c.massa_estimada_g !== undefined,
      fontes: c.fontes,
    };
  }
  return out;
}
