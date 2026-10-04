import { z } from "zod";

import { difficultyDomainSchema, difficultyLevelSchema } from "@/domain/core/difficulty";
import { locationKindSchema } from "@/domain/core/location";
import { priceRangeSchema, usdPriceSchema } from "@/domain/core/money";
import { safetyAlertSchema } from "@/domain/core/safety";
import { isoDateSchema, sourceSchema } from "@/domain/core/source";
import { verificationStatusSchema } from "@/domain/core/verification";

/*
 * Schemas do catálogo de drones (SPEC B.5).
 *
 * Convenção de nomes: entidades com os nomes da SPEC (Component, ThrustData...), campos em
 * português snake_case, mantendo em inglês os termos técnicos que perderiam o sentido se
 * traduzidos (kv, throttle, failsafe, stack, frame...). Toda grandeza física tem a unidade no
 * nome do campo (_mm, _g, _a, _v, _mah, _pol = polegadas).
 *
 * Quase todos os campos de specs são opcionais de propósito: só preenchemos o que tem fonte
 * confiável (SPEC B.6). Regra sem dado responde "sem dado", nunca chuta.
 */

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

/**
 * Furação (padrão de furos de fixação), em dois formatos:
 * - retangular "AxB M3" (ex.: "16x19 M3", "30.5x30.5 M3", "9x9 M2"): distâncias entre furos em mm;
 * - circular "ØD NxMr" (ex.: "Ø6.6 3xM1.4", motores de whoop): N furos de rosca Mr num círculo de
 *   D mm de diâmetro.
 * "M3" é a rosca do parafuso (opcional no formato retangular).
 */
export const mountPatternSchema = z
  .string()
  .regex(
    /^(\d+(\.\d+)?x\d+(\.\d+)?( M\d(\.\d)?)?|Ø\d+(\.\d+)? \dxM\d(\.\d)?)$/,
    "use o formato 16x19 M3 (ou Ø6.6 3xM1.4 para furação circular)",
  );
export type MountPattern = z.infer<typeof mountPatternSchema>;

/** Normaliza "19x16 M3" → "16x19 M3" para comparar furações (circular fica igual). */
export function normalizeMountPattern(pattern: string): string {
  if (pattern.trim().startsWith("Ø")) return pattern.trim();
  const [dims = "", thread] = pattern.trim().split(/\s+/);
  const nums = dims
    .split("x")
    .map(Number)
    .sort((a, b) => a - b);
  return `${nums.join("x")}${thread ? ` ${thread}` : ""}`;
}

type ParsedMount =
  | { tipo: "retangular"; a: number; b: number; rosca?: string }
  | { tipo: "circular"; diametro: number; furos: number; rosca: string };

function parseMountPattern(pattern: string): ParsedMount | undefined {
  const r = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(?: (M\d(?:\.\d)?))?$/.exec(pattern.trim());
  if (r) return { tipo: "retangular", a: Number(r[1]), b: Number(r[2]), rosca: r[3] };
  const c = /^Ø(\d+(?:\.\d+)?) (\d)x(M\d(?:\.\d)?)$/.exec(pattern.trim());
  if (c)
    return { tipo: "circular", diametro: Number(c[1]), furos: Number(c[2]), rosca: c[3] ?? "" };
  return undefined;
}

/**
 * A peça (motor, FC) com furação "AxB" tem furos opostos a A mm num eixo e a B mm no eixo
 * perpendicular. Ela encaixa se a base oferecer A num eixo e B no outro (a peça pode girar 90°).
 * A base pode listar vários padrões nos mesmos eixos: o braço do X500 V2 tem "16x16" e "19x19",
 * então aceita um motor "16x19" (é assim que a Holybro vende o kit). A rosca (M2, M3) precisa ser a
 * mesma quando as duas estão informadas. Furação circular só encaixa em circular com o mesmo
 * número de furos e a mesma rosca. Tolerância de 0,3 mm para arredondamentos de datasheet.
 */
export function mountFits(part: string, base: readonly string[]): boolean {
  const p = parseMountPattern(part);
  if (!p) return false;
  const near = (x: number, v: number) => Math.abs(x - v) <= 0.3;
  if (p.tipo === "circular") {
    return base.some((pattern) => {
      const q = parseMountPattern(pattern);
      return (
        q?.tipo === "circular" &&
        q.furos === p.furos &&
        q.rosca === p.rosca &&
        near(q.diametro, p.diametro)
      );
    });
  }
  const eixo1: number[] = [];
  const eixo2: number[] = [];
  for (const pattern of base) {
    const q = parseMountPattern(pattern);
    if (q?.tipo !== "retangular") continue;
    if (p.rosca && q.rosca && p.rosca !== q.rosca) continue;
    eixo1.push(q.a);
    eixo2.push(q.b);
  }
  const has = (eixo: number[], v: number) => eixo.some((x) => near(x, v));
  return (has(eixo1, p.a) && has(eixo2, p.b)) || (has(eixo2, p.a) && has(eixo1, p.b));
}

export const BATTERY_CONNECTORS = [
  "XT60",
  "XT30",
  "XT90",
  "XT60H",
  "BT2.0",
  "PH2.0",
  "A30",
  "EC5",
] as const;
export const batteryConnectorSchema = z.enum(BATTERY_CONNECTORS);

/** Protocolos de link de rádio de controle. */
export const RC_LINKS = ["elrs_2g4", "elrs_900", "elrs_dual", "crossfire", "outro"] as const;
export const rcLinkSchema = z.enum(RC_LINKS);

/** Saídas seriais que um receptor pode fornecer para a FC. */
export const RX_OUTPUTS = ["CRSF", "MAVLink", "SBUS"] as const;

/** Sistemas de vídeo: peças de sistemas diferentes não conversam entre si. */
export const VIDEO_SYSTEMS = ["analogico_5g8", "dji_o4", "walksnail", "hdzero", "wifi_ip"] as const;
export const videoSystemSchema = z.enum(VIDEO_SYSTEMS);
export type VideoSystem = z.infer<typeof videoSystemSchema>;

/** Como a hélice prende no motor. */
export const PROP_MOUNTS = [
  "eixo_5mm_porca", // eixo M5 com porca (hélices de 5" e 450 mm com adaptador)
  "autoaperto", // rosca própria da hélice (ex.: DJI 9450 self-tightening)
  "t_mount", // 3 parafusos (micros e alguns 3")
  "pressao_1mm", // encaixe por pressão em eixo de 1 mm (whoop)
  "pressao_1_5mm", // encaixe por pressão em eixo de 1,5 mm (whoop/micro)
  "rosca_m6", // eixo com rosca M6: a hélice (ou o adaptador dela) rosqueia no eixo (ex.: T-Motor AIR2216 II)
] as const;
export const propMountSchema = z.enum(PROP_MOUNTS);

export const FIRMWARES = ["ArduPilot", "Betaflight", "INAV"] as const;
export const firmwareSchema = z.enum(FIRMWARES);
export type Firmware = z.infer<typeof firmwareSchema>;

export const WHERE_TO_BUY_KINDS = [
  "marketplace_nacional", // Mercado Livre, Amazon Brasil...
  "importacao", // AliExpress e lojas no exterior
  "loja_hobby_robotica", // lojas brasileiras de hobby/robótica (tipo de loja, sem link)
  "loja_ferramentas", // ferramentas, EPI
  "fabricante", // loja oficial do fabricante
] as const;

/** Onde comprar: só termos de busca, nunca link de anúncio específico (SPEC B.1.6). */
export const whereToBuySchema = z.object({
  tipo_loja: z.enum(WHERE_TO_BUY_KINDS),
  termo_busca: z.string().min(2),
  observacao: z.string().optional(),
});
export type WhereToBuy = z.infer<typeof whereToBuySchema>;

const range = (s: z.ZodNumber) => z.tuple([s, s]).refine(([a, b]) => b >= a, "faixa invertida");

// ---------------------------------------------------------------------------
// Specs por categoria de peça
// ---------------------------------------------------------------------------

export const frameSpecsSchema = z.object({
  geometria: z.enum(["X", "true-X", "stretch-X", "H", "deadcat"]).optional(),
  distancia_entre_eixos_mm: z.number().positive().optional(),
  helice_max_pol: z.number().positive().optional(),
  /** Frames com dutos (whoops): a hélice precisa ter o tamanho do duto; menor perde empuxo. */
  helice_min_pol: z.number().positive().optional(),
  furacao_motor: z.array(mountPatternSchema).optional(),
  furacao_stack: z.array(mountPatternSchema).optional(),
  espessura_braco_mm: z.number().positive().optional(),
  material: z.enum(["fibra_de_carbono", "fibra_de_vidro_nylon", "plastico", "pcb"]).optional(),
  /** Placa de distribuição de energia embutida no frame (comum em frames 450). */
  pdb_integrada: z.boolean().optional(),
  /** Conector de bateria da PDB do frame, quando vem pronto (ex.: XT60 no X500 V2). */
  conector_bateria: batteryConnectorSchema.optional(),
  /** Placa plana onde a FC é presa com espuma/fita anti-vibração (padrão das Pixhawk). */
  fixacao_fc_fita: z.boolean().optional(),
  /** Suporte de GPS que já vem com o frame: altura (mm) acima da placa onde ele é fixado. */
  mastro_gps_mm: z.number().positive().optional(),
  /** Dutos/protetores ao redor das hélices (whoops). */
  protecao_helices: z.boolean().optional(),
  trem_de_pouso: z.boolean().optional(),
  /** Encaixe da bateria (whoops): seção interna largura × altura (mm). Bateria mais grossa não
   *  entra; frames de 5" usam strap e não têm este limite. */
  slot_bateria_mm: z
    .object({ largura: z.number().positive(), altura: z.number().positive() })
    .optional(),
});

export const motorSpecsSchema = z.object({
  /** Tamanho do estator "DDHH": 2212 = 22 mm de diâmetro x 12 mm de altura. */
  estator: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  kv: z.number().positive().optional(),
  celulas_min: z.int().min(1).optional(),
  celulas_max: z.int().min(1).optional(),
  furacao: z.array(mountPatternSchema).optional(),
  eixo_mm: z.number().positive().optional(),
  fixacao_helice: z.array(propMountSchema).optional(),
  /** Corrente máxima informada pelo fabricante (A). */
  corrente_max_a: z.number().positive().optional(),
});

export const propSpecsSchema = z.object({
  diametro_pol: z.number().positive().optional(),
  passo_pol: z.number().positive().optional(),
  pas: z.int().min(2).max(6).optional(),
  material: z.enum(["plastico", "nylon_fibra_de_vidro", "fibra_de_carbono"]).optional(),
  fixacao: propMountSchema.optional(),
});

const escCommon = {
  corrente_continua_a: z.number().positive().optional(),
  corrente_pico_a: z.number().positive().optional(),
  celulas_min: z.int().min(1).optional(),
  celulas_max: z.int().min(1).optional(),
  firmware: z.enum(["BLHeli_S", "BLHeli_32", "AM32", "Bluejay", "SimonK", "outro"]).optional(),
  protocolos: z
    .array(z.enum(["PWM", "OneShot125", "Multishot", "DShot150", "DShot300", "DShot600"]))
    .optional(),
};

/** ESC individual (um por motor). */
export const escSpecsSchema = z.object(escCommon);

/** ESC 4 em 1 (uma placa para os quatro motores). Corrente informada é por motor. */
export const esc4in1SpecsSchema = z.object({
  ...escCommon,
  furacao: z.array(mountPatternSchema).optional(),
  sensor_corrente: z.boolean().optional(),
  /** Conector de bateria que vem soldado/incluso (ex.: rabicho XT60). */
  conector_bateria: batteryConnectorSchema.optional(),
});

export const becSchema = z.object({
  tensao_v: z.number().positive(),
  corrente_a: z.number().positive(),
  observacao: z.string().optional(),
});

export const uartSchema = z.object({
  nome: z.string().min(1),
  /** RX com DMA: o ArduPilot pede DMA na UART do receptor CRSF/ELRS em placas F4/F7. */
  dma_rx: z.boolean().optional(),
  observacao: z.string().optional(),
});

export const fcSpecsSchema = z.object({
  mcu: z.string().optional(),
  flash_mb: z.number().positive().optional(),
  firmwares: z
    .array(
      z.object({
        nome: firmwareSchema,
        /** Nome da placa no firmware (ex.: "MatekH743" no ArduPilot). */
        alvo: z.string().min(1),
        /** Consta na lista oficial de placas suportadas daquele firmware. */
        lista_oficial: z.boolean(),
      }),
    )
    .optional(),
  /** UARTs livres para periféricos (receptor, GPS, telemetria...). Não inclui a USB. */
  uarts: z.array(uartSchema).optional(),
  saidas_motor: z.int().min(1).optional(),
  becs: z.array(becSchema).optional(),
  entrada_celulas_min: z.int().min(1).optional(),
  entrada_celulas_max: z.int().min(1).optional(),
  furacao: z.array(mountPatternSchema).optional(),
  barometro: z.boolean().optional(),
  osd_analogico: z.boolean().optional(),
  sensor_corrente: z.boolean().optional(),
  sensor_tensao: z.boolean().optional(),
  cartao_sd: z.boolean().optional(),
  /** Projetada para ser presa com espuma/fita anti-vibração (padrão das Pixhawk), sem furação. */
  fixacao_fita: z.boolean().optional(),
});

export const receiverSpecsSchema = z.object({
  link: rcLinkSchema.optional(),
  saidas: z.array(z.enum(RX_OUTPUTS)).optional(),
  /** Baseado em ESP (tem Wi-Fi): requisito do modo MAVLink do ELRS. */
  esp: z.boolean().optional(),
  tensao_v_min: z.number().positive().optional(),
  tensao_v_max: z.number().positive().optional(),
  corrente_ma: z.number().positive().optional(),
});

export const radioSpecsSchema = z.object({
  link: rcLinkSchema.optional(),
  modulo: z.enum(["interno", "externo"]).optional(),
  esp: z.boolean().optional(),
  /** Tem TX Backpack com Wi-Fi: permite mandar a telemetria MAVLink para o celular. */
  backpack_wifi: z.boolean().optional(),
  firmware_radio: z.enum(["EdgeTX", "OpenTX", "outro"]).optional(),
  /** Funciona como joystick USB no PC (para treinar em simulador). */
  joystick_usb: z.boolean().optional(),
  potencia_max_mw: z.number().positive().optional(),
  /** Ex.: "2 baterias 18650 (não inclusas)". */
  alimentacao: z.string().optional(),
});

export const vtxSpecsSchema = z.object({
  sistema: videoSystemSchema.optional(),
  potencias_mw: z.array(z.number().positive()).optional(),
  tensao_v_min: z.number().positive().optional(),
  tensao_v_max: z.number().positive().optional(),
  corrente_ma_max: z.number().positive().optional(),
  controle: z.enum(["SmartAudio", "Tramp", "MSP", "nenhum"]).optional(),
  conector_antena: z.enum(["MMCX", "U.FL", "SMA", "RP-SMA"]).optional(),
  furacao: z.array(mountPatternSchema).optional(),
});

export const cameraSpecsSchema = z.object({
  sistema: videoSystemSchema.optional(),
  tensao_v_min: z.number().positive().optional(),
  tensao_v_max: z.number().positive().optional(),
  corrente_ma: z.number().positive().optional(),
  /** Tamanho da câmera (encaixe no frame): whoop = câmera minúscula presa no canopy. */
  formato: z.enum(["micro_19mm", "nano_14mm", "full_22mm", "aio", "whoop"]).optional(),
});

export const videoReceiverSpecsSchema = z.object({
  sistema: videoSystemSchema.optional(),
  interface: z.enum(["usb_uvc", "hdmi", "av"]).optional(),
  android: z.boolean().optional(),
  ios: z.boolean().optional(),
  app: z.string().optional(),
});

export const gogglesSpecsSchema = z.object({
  sistema: videoSystemSchema.optional(),
  receptor_analogico: z.boolean().optional(),
});

export const antennaSpecsSchema = z.object({
  frequencia_ghz: z.number().positive().optional(),
  polarizacao: z.enum(["RHCP", "LHCP", "linear"]).optional(),
  conector: z.enum(["MMCX", "U.FL", "SMA", "RP-SMA"]).optional(),
});

export const gpsSpecsSchema = z.object({
  gnss: z.string().optional(),
  /** Chip da bússola embutida; null = módulo sem bússola. */
  bussola: z.string().nullable().optional(),
  protocolo: z.enum(["UBX", "NMEA"]).optional(),
  tensao_v: z.number().positive().optional(),
  corrente_ma: z.number().positive().optional(),
});

export const gpsMastSpecsSchema = z.object({
  altura_mm: z.number().positive().optional(),
  dobravel: z.boolean().optional(),
});

export const TELEMETRY_KINDS = ["wifi_esp32_dronebridge", "wifi_esp8266_mavesp"] as const;
export const telemetrySpecsSchema = z.object({
  tipo: z.enum(TELEMETRY_KINDS).optional(),
  alcance_m_tipico: z.number().positive().optional(),
  tensao_v: z.number().positive().optional(),
  corrente_ma: z.number().positive().optional(),
  baud: z.int().positive().optional(),
});

export const powerModuleSpecsSchema = z.object({
  mede_corrente: z.boolean().optional(),
  mede_tensao: z.boolean().optional(),
  celulas_max: z.int().min(1).optional(),
  corrente_continua_a: z.number().positive().optional(),
  becs: z.array(becSchema).optional(),
  conector: batteryConnectorSchema.optional(),
  /** Também distribui energia para os ESCs (PDB). */
  pdb: z.boolean().optional(),
});

export const batterySpecsSchema = z.object({
  celulas: z.int().min(1).optional(),
  capacidade_mah: z.number().positive().optional(),
  /** C contínuo informado pelo fabricante (costuma ser otimista). */
  c_continuo: z.number().positive().optional(),
  c_pico: z.number().positive().optional(),
  conector: batteryConnectorSchema.optional(),
  quimica: z.enum(["LiPo", "LiHV", "Li-ion"]).optional(),
});

export const chargerSpecsSchema = z.object({
  potencia_w: z.number().positive().optional(),
  celulas_min: z.int().min(1).optional(),
  celulas_max: z.int().min(1).optional(),
  balanceador: z.boolean().optional(),
  entrada: z.enum(["AC", "DC", "AC_DC"]).optional(),
  corrente_max_a: z.number().positive().optional(),
});

export const connectorSpecsSchema = z.object({
  tipo: batteryConnectorSchema.optional(),
});

export const genericSpecsSchema = z.object({}).loose();

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

const componentBase = {
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "use letras minúsculas, números e hífens"),
  marca: z.string().min(1),
  modelo: z.string().min(1),
  /** Para que serve, em uma frase para leigos. */
  descricao_leiga: z.string().min(1),
  /** Massa publicada pelo fabricante (g). */
  massa_g: z.number().positive().optional(),
  /** Quando o fabricante não publica a massa: estimativa explícita do From Scratch, com o motivo.
   *  Entra no peso total, mas o relatório lista que foi estimada. */
  massa_estimada_g: z
    .object({ valor: z.number().positive(), motivo: z.string().min(1) })
    .optional(),
  dimensoes_mm: z
    .object({ comprimento: z.number(), largura: z.number(), altura: z.number() })
    .optional(),
  /** Quantas unidades vêm no item vendido (ex.: hélices em pacote com 4). */
  unidades_por_pacote: z.int().min(1).default(1),
  /** Preço em lojas brasileiras, quando há fonte. Por item vendido (pacote). */
  preco_estimado_brl: priceRangeSchema.optional(),
  /** Preço em loja internacional (US$, sem frete e tributos). Por item vendido (pacote). Pelo
   *  menos um dos dois preços é obrigatório (checkCatalog). */
  preco_referencia_usd: usdPriceSchema.optional(),
  onde_comprar: z.array(whereToBuySchema).min(1),
  fontes: z.array(sourceSchema).default([]),
  status_verificacao: verificationStatusSchema.default("nao_verificado"),
  notas_seguranca: z.array(z.string()).default([]),
  notas: z.array(z.string()).default([]),
  licenca_modelo_3d: z.string().optional(),
  /** O que vem na caixa junto (ex.: kit ARF com motores; VTX com antena). Ids do catálogo. */
  inclui: z.array(z.object({ componente_id: z.string(), quantidade: z.int().min(1) })).default([]),
  /** false = só vem dentro de outro produto (não tem preço próprio). */
  vendido_separadamente: z.boolean().default(true),
  /** Faixas de preço em que o curador recomenda a peça; vazio = todas. */
  faixas: z.array(z.enum(["economica", "equilibrada", "premium"])).default([]),
};

const component = <C extends string, S extends z.ZodType>(categoria: C, specs: S) =>
  z.object({ ...componentBase, categoria: z.literal(categoria), specs });

export const componentSchema = z.discriminatedUnion("categoria", [
  component("frame", frameSpecsSchema),
  component("motor", motorSpecsSchema),
  component("helice", propSpecsSchema),
  component("esc", escSpecsSchema),
  component("esc_4em1", esc4in1SpecsSchema),
  component("fc", fcSpecsSchema),
  component("stack", z.object({ fc: fcSpecsSchema, esc: esc4in1SpecsSchema })),
  component(
    "fc_aio",
    z.object({
      fc: fcSpecsSchema,
      esc: esc4in1SpecsSchema,
      receptor: receiverSpecsSchema.optional(),
      /** VTX embutido na placa (AIO de whoop "5 em 1"). */
      vtx: vtxSpecsSchema.optional(),
    }),
  ),
  component("bateria", batterySpecsSchema),
  component("receptor", receiverSpecsSchema),
  component("radio_tx", radioSpecsSchema),
  component("vtx", vtxSpecsSchema),
  component("camera_fpv", cameraSpecsSchema),
  component("receptor_video", videoReceiverSpecsSchema),
  component("oculos_fpv", gogglesSpecsSchema),
  component("antena", antennaSpecsSchema),
  component("gps", gpsSpecsSchema),
  component("mastro_gps", gpsMastSpecsSchema),
  component("telemetria", telemetrySpecsSchema),
  component("modulo_energia", powerModuleSpecsSchema),
  component("buzzer", genericSpecsSchema),
  component("camera_acao", genericSpecsSchema),
  component("carregador", chargerSpecsSchema),
  component("fonte", genericSpecsSchema),
  component("conector", connectorSpecsSchema),
  component("cabo", genericSpecsSchema),
  component("parafuso", genericSpecsSchema),
  component("strap", genericSpecsSchema),
  component("consumivel", genericSpecsSchema),
  /** Conjunto vendido numa caixa só (ex.: kit ARF); o conteúdo vem em "inclui". */
  component("kit", genericSpecsSchema),
  /** Acessório que voa preso ao drone (ex.: canopy do whoop, que segura a câmera). */
  component("acessorio", genericSpecsSchema),
  /** Baterias do rádio (ficam no chão). */
  component(
    "bateria_radio",
    z.object({ tipo: z.string().optional(), unidades: z.int().min(1).optional() }),
  ),
]);
export type Component = z.infer<typeof componentSchema>;
export type ComponentCategory = Component["categoria"];
export type ComponentOf<C extends ComponentCategory> = Extract<Component, { categoria: C }>;

export function isCategory<C extends ComponentCategory>(
  component: Component,
  categoria: C,
): component is ComponentOf<C> {
  return component.categoria === categoria;
}

// ---------------------------------------------------------------------------
// Tabela de empuxo (motor + hélice + nº de células)
// ---------------------------------------------------------------------------

export const thrustPointSchema = z.object({
  throttle_pct: z.number().min(0).max(100),
  empuxo_g: z.number().nonnegative(),
  corrente_a: z.number().nonnegative(),
  potencia_w: z.number().nonnegative().optional(),
});
export type ThrustPoint = z.infer<typeof thrustPointSchema>;

export const thrustDataSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  motor_id: z.string(),
  helice_id: z.string(),
  celulas: z.int().min(1),
  /** Tensão usada no teste do fabricante (V), quando informada. */
  tensao_teste_v: z.number().positive().optional(),
  pontos: z.array(thrustPointSchema).min(2),
  /** Tabela de empuxo sem fonte não entra no catálogo. */
  fontes: z.array(sourceSchema).min(1),
  status_verificacao: verificationStatusSchema.default("nao_verificado"),
  notas: z.array(z.string()).default([]),
});
export type ThrustData = z.infer<typeof thrustDataSchema>;

// ---------------------------------------------------------------------------
// Drones prontos (para comparar montar × comprar pronto)
// ---------------------------------------------------------------------------

/**
 * Drone pronto de referência para o arquétipo. A comparação soma o preço dele com o que ainda
 * falta comprar (as peças do projeto cujas categorias ele não traz) e mostra o resultado ao lado
 * do custo de montar. Preço sempre da loja oficial, com data (SPEC B.1.2).
 */
export const readyMadeSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  arquetipo_id: z.string().min(1),
  marca: z.string().min(1),
  modelo: z.string().min(1),
  /** RTF: vem com rádio (e tela ou óculos); BNF: só o drone, você usa o seu rádio. */
  tipo: z.enum(["RTF", "BNF"]),
  descricao_leiga: z.string().min(1),
  /** Categorias de peça do projeto que o pronto já traz; as demais continuam na lista de compras. */
  cobre_categorias: z.array(z.string()).min(1),
  /** Baterias de voo na caixa (o projeto pode prever mais). */
  baterias_inclusas: z.int().min(0).optional(),
  /** Massa informada pelo fabricante (g). */
  massa_g: z.number().positive().optional(),
  /** Tempo de voo informado pelo fabricante (min), nas condições dele (veja as notas). */
  tempo_voo_fabricante_min: z.number().positive().optional(),
  preco_estimado_brl: priceRangeSchema.optional(),
  preco_referencia_usd: usdPriceSchema.optional(),
  onde_comprar: z.array(whereToBuySchema).min(1),
  fontes: z.array(sourceSchema).min(1),
  status_verificacao: verificationStatusSchema.default("nao_verificado"),
  /** O que muda em relação a montar, sem número inventado. */
  diferencas: z.array(z.string()).default([]),
  notas: z.array(z.string()).default([]),
});
export type ReadyMade = z.infer<typeof readyMadeSchema>;

// ---------------------------------------------------------------------------
// Ferramentas, consumíveis e EPI
// ---------------------------------------------------------------------------

export const toolSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  nome: z.string().min(1),
  tipo: z.enum(["ferramenta", "consumivel", "epi"]),
  prioridade: z.enum(["essencial", "recomendada", "opcional"]),
  para_que_serve: z.string().min(1),
  por_que_necessaria: z.string().min(1),
  alternativa_barata: z.string().optional(),
  cuidados: z.array(z.string()).default([]),
  /** Ausente = preço ainda não pesquisado (o custo mostra o item à parte, sem somar). */
  preco_estimado_brl: priceRangeSchema.optional(),
  onde_comprar: z.array(whereToBuySchema).min(1),
  /** Arquétipos que usam a ferramenta; vazio = todos. */
  arquetipos: z.array(z.string()).default([]),
  fontes: z.array(sourceSchema).default([]),
});
export type Tool = z.infer<typeof toolSchema>;

// ---------------------------------------------------------------------------
// Passos de montagem (templates por arquétipo)
// ---------------------------------------------------------------------------

/** Condição para um passo aparecer (ex.: só quando a telemetria é por Wi-Fi no drone). */
export const stepConditionSchema = z.object({
  /** O build precisa ter alguma peça destas categorias. */
  tem_categoria: z.array(z.string()).optional(),
  /** O build não pode ter peças destas categorias. */
  sem_categoria: z.array(z.string()).optional(),
  /** Opção de telemetria escolhida. */
  telemetria: z.array(z.string()).optional(),
  /** O build precisa ter alguma destas peças (ids do catálogo). */
  tem_componente: z.array(z.string()).optional(),
});

export const buildStepTemplateSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  titulo: z.string().min(1),
  objetivo: z.string().min(1),
  por_que_importa: z.string().min(1),
  /** Categorias de peça usadas/destacadas no 3D. */
  pecas: z.array(z.string()).default([]),
  ferramentas: z.array(z.string()).default([]),
  tempo_min: range(z.number().nonnegative()),
  dominios: z.partialRecord(difficultyDomainSchema, difficultyLevelSchema),
  riscos: z.array(z.string()).default([]),
  /** Checklist que o usuário precisa marcar para avançar (SPEC B.9). */
  checkpoint: z
    .object({ bloqueante: z.literal(true), itens: z.array(z.string()).min(1) })
    .optional(),
  como_saber_que_deu_certo: z.array(z.string()).min(1),
  erros_comuns: z.array(z.string()).default([]),
  local: locationKindSchema,
  /** Alertas de segurança (ids) mostrados neste passo. */
  alertas: z.array(z.string()).default([]),
  /** Variáveis preenchidas pelo projeto, ex.: "{RTL_ALT_M}". */
  variaveis: z.array(z.string()).default([]),
  condicao: stepConditionSchema.optional(),
  /** Passo opcional (ex.: AutoTune): aparece no guia, mas não entra na nota de dificuldade. */
  opcional: z.boolean().default(false),
  fontes: z.array(sourceSchema).default([]),
});
export type BuildStepTemplate = z.infer<typeof buildStepTemplateSchema>;

// ---------------------------------------------------------------------------
// Parâmetros de firmware (dados versionados, nunca texto solto do LLM)
// ---------------------------------------------------------------------------

export const firmwareParamSchema = z
  .object({
    nome: z.string().min(1),
    /** Valor fixo. */
    valor: z.union([z.number(), z.string()]).optional(),
    /** Valor que depende do build: variável × fator (ex.: BATT_LOW_MAH = 20% da capacidade). */
    calculo: z
      .object({
        variavel: z.enum(["celulas", "capacidade_mah"]),
        fator: z.number(),
        /** Casas decimais do resultado (padrão 1). */
        casas: z.int().min(0).max(3).optional(),
      })
      .optional(),
    unidade: z.string().optional(),
    explicacao: z.string().min(1),
    /** Em que condição o parâmetro se aplica (ex.: só com telemetria ELRS MAVLink). */
    condicao: stepConditionSchema.optional(),
    fontes: z.array(sourceSchema).min(1),
  })
  .refine((p) => (p.valor === undefined) !== (p.calculo === undefined), {
    message: "informe valor OU calculo",
  });
export type FirmwareParam = z.infer<typeof firmwareParamSchema>;

export const firmwareProfileSchema = z.object({
  /** Ex.: "arducopter-4.7". */
  id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
  firmware: firmwareSchema,
  /** Ex.: "ArduCopter". */
  veiculo: z.string().optional(),
  versao_min: z.string(),
  versao_max: z.string().optional(),
  verificado_em: isoDateSchema,
  parametros: z.array(firmwareParamSchema),
  notas: z.array(z.string()).default([]),
});
export type FirmwareProfile = z.infer<typeof firmwareProfileSchema>;

// ---------------------------------------------------------------------------
// Arquétipo
// ---------------------------------------------------------------------------

/** Um "lugar" na lista de peças do arquétipo (ex.: 4 motores, 1 FC...). */
export const archetypeSlotSchema = z.object({
  slot: z.string().min(1),
  /** Categorias aceitas no slot (ex.: ESC individual ou 4 em 1, ou uma stack). */
  categorias: z.array(z.string()).min(1),
  quantidade: z.int().min(1),
  obrigatorio: z.boolean(),
  /** Se outro slot já trouxer esta função (ex.: stack inclui o ESC), este fica vazio. */
  coberto_por: z.array(z.string()).default([]),
  /** Só aceita peças com estas specs (ex.: {"pdb": true} para a placa de distribuição). */
  filtro_specs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  /** Quantas comprar por faixa (ex.: baterias reservas); padrão = quantidade. */
  compra_por_faixa: z
    .object({
      economica: z.int().min(1),
      equilibrada: z.int().min(1),
      premium: z.int().min(1),
    })
    .optional(),
});

/**
 * Jeito típico de voar do arquétipo: muda a corrente média em relação à de pairar (autonomia).
 * estavel = filmagem/GPS; freestyle = acrobacias com acelerações fortes; indoor = whoop em casa.
 */
export const FLIGHT_STYLES = ["estavel", "freestyle", "indoor"] as const;
export type FlightStyle = (typeof FLIGHT_STYLES)[number];

export const archetypeSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  nome: z.string().min(1),
  descricao: z.string().min(1),
  para_quem: z.string().min(1),
  firmware: firmwareSchema,
  estilo_voo: z.enum(FLIGHT_STYLES).default("estavel"),
  /** Perfil de parâmetros de firmware usado pelo arquétipo (id em perfis_firmware). */
  perfil_firmware: z.string().optional(),
  faixas: z.object({
    helice_pol: range(z.number().positive()),
    celulas: range(z.number().int().positive()),
    massa_alvo_g: range(z.number().positive()),
    twr_alvo: range(z.number().positive()),
  }),
  /** Limite de massa que faz parte da promessa do arquétipo (ex.: sub-250 g). */
  massa_max_g: z.number().positive().optional(),
  slots: z.array(archetypeSlotSchema).min(1),
  /** Orçamento de referência por faixa (R$), quando definido. */
  orcamento_referencia_brl: z
    .object({
      economica: z.number().positive(),
      equilibrada: z.number().positive(),
      premium: z.number().positive(),
    })
    .optional(),
  passos: z.array(buildStepTemplateSchema),
  alertas: z.array(safetyAlertSchema).default([]),
  fontes: z.array(sourceSchema).default([]),
});
export type Archetype = z.infer<typeof archetypeSchema>;
