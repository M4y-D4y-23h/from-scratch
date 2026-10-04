import type { Build, BuildItem, BuildOptions } from "../build";
import { DEFAULT_DRONE_CONFIG } from "../config";
import type { ValidationContext } from "../compatibility";
import {
  type Archetype,
  type Component,
  componentSchema,
  type FirmwareProfile,
  type ThrustData,
  thrustDataSchema,
} from "../schema";
import { SRC } from "../sources";

/*
 * Dados SINTÉTICOS para testes: números redondos e plausíveis, não são peças do catálogo.
 * Servem para provar cada regra isoladamente (passa / falha / sem dado).
 *
 * Conta de referência do baseBuild() (usada nos testes):
 *   peças que voam = 968 g; margem 8% = 77,44 g; peso total = 1045,44 g
 *   empuxo máximo = 4 × 850 g = 3400 g → TWR ≈ 3,25; pairar ≈ 44,6% do acelerador
 */

const PRICE = { min: 10, max: 20, data: "2026-10-04" };
const WHERE = [{ tipo_loja: "marketplace_nacional", termo_busca: "peca de teste" }];

type ComponentInput = Omit<Partial<Component>, "categoria" | "specs"> & {
  categoria: Component["categoria"];
  specs: Record<string, unknown>;
};

/** Cria um componente válido (passa pelo schema zod, que preenche os padrões). */
export function makeComponent(input: ComponentInput): Component {
  return componentSchema.parse({
    id: `${input.categoria.replace(/_/g, "-")}-teste`,
    marca: "Teste",
    modelo: "Sintético",
    descricao_leiga: "Peça sintética para testes.",
    preco_estimado_brl: PRICE,
    onde_comprar: WHERE,
    ...input,
  });
}

/**
 * Copia uma peça trocando specs e/ou campos de topo (passa de novo pelo schema).
 * Ex.: tweak(parts.esc(), { corrente_continua_a: 10 }).
 */
export function tweak(
  component: Component,
  specs: Record<string, unknown> = {},
  fields: Partial<Omit<Component, "categoria" | "specs">> = {},
): Component {
  return componentSchema.parse({
    ...component,
    ...fields,
    specs: { ...component.specs, ...specs },
  });
}

export const parts = {
  frame: () =>
    makeComponent({
      categoria: "frame",
      massa_g: 280,
      specs: {
        geometria: "X",
        distancia_entre_eixos_mm: 450,
        helice_max_pol: 10,
        furacao_motor: ["16x19 M3"],
        furacao_stack: ["30.5x30.5 M3"],
        pdb_integrada: true,
      },
    }),
  motor: () =>
    makeComponent({
      categoria: "motor",
      massa_g: 56,
      specs: {
        estator: "2212",
        kv: 920,
        celulas_min: 3,
        celulas_max: 4,
        // Ordem invertida de propósito: a regra normaliza "19x16" para "16x19".
        furacao: ["19x16 M3"],
        fixacao_helice: ["eixo_5mm_porca", "autoaperto"],
      },
    }),
  prop: () =>
    makeComponent({
      categoria: "helice",
      massa_g: 13,
      specs: {
        diametro_pol: 10,
        passo_pol: 4.5,
        pas: 2,
        material: "plastico",
        fixacao: "autoaperto",
      },
    }),
  esc: () =>
    makeComponent({
      categoria: "esc",
      massa_g: 25,
      specs: { corrente_continua_a: 30, celulas_min: 2, celulas_max: 4, firmware: "BLHeli_S" },
    }),
  fc: () =>
    makeComponent({
      categoria: "fc",
      massa_g: 10,
      specs: {
        mcu: "STM32H743",
        flash_mb: 2,
        firmwares: [{ nome: "ArduPilot", alvo: "TesteH743", lista_oficial: true }],
        uarts: [
          { nome: "SERIAL1", dma_rx: true },
          { nome: "SERIAL2", dma_rx: true },
          { nome: "SERIAL3", dma_rx: true },
          { nome: "SERIAL4", dma_rx: true },
        ],
        saidas_motor: 8,
        becs: [
          { tensao_v: 5, corrente_a: 2 },
          { tensao_v: 9, corrente_a: 2 },
        ],
        entrada_celulas_min: 2,
        entrada_celulas_max: 6,
        furacao: ["30.5x30.5 M3"],
        sensor_tensao: true,
        sensor_corrente: false,
      },
    }),
  battery: () =>
    makeComponent({
      categoria: "bateria",
      massa_g: 240,
      specs: {
        celulas: 3,
        capacidade_mah: 3000,
        c_continuo: 30,
        conector: "XT60",
        quimica: "LiPo",
      },
    }),
  connector: () => makeComponent({ categoria: "conector", massa_g: 4, specs: { tipo: "XT60" } }),
  receiver: () =>
    makeComponent({
      categoria: "receptor",
      massa_g: 2,
      specs: {
        link: "elrs_2g4",
        saidas: ["CRSF", "MAVLink"],
        esp: true,
        tensao_v_min: 5,
        tensao_v_max: 5,
        corrente_ma: 100,
      },
    }),
  radio: () =>
    makeComponent({
      categoria: "radio_tx",
      massa_g: 400,
      specs: { link: "elrs_2g4", esp: true, backpack_wifi: true },
    }),
  gps: () =>
    makeComponent({
      categoria: "gps",
      massa_g: 20,
      specs: { gnss: "M10", bussola: "QMC5883L", tensao_v: 5, corrente_ma: 50 },
    }),
  mast: () => makeComponent({ categoria: "mastro_gps", massa_g: 15, specs: { altura_mm: 120 } }),
  telemetry: () =>
    makeComponent({
      categoria: "telemetria",
      massa_g: 5,
      specs: { tipo: "wifi_esp32_dronebridge", tensao_v: 5, corrente_ma: 150, baud: 115200 },
    }),
  camera: () =>
    makeComponent({
      categoria: "camera_fpv",
      massa_g: 8,
      specs: { sistema: "analogico_5g8", tensao_v_min: 4.5, tensao_v_max: 36, corrente_ma: 150 },
    }),
  vtx: () =>
    makeComponent({
      categoria: "vtx",
      massa_g: 6,
      specs: {
        sistema: "analogico_5g8",
        tensao_v_min: 7,
        tensao_v_max: 26,
        corrente_ma_max: 500,
        conector_antena: "MMCX",
      },
    }),
  antenna: () =>
    makeComponent({
      categoria: "antena",
      massa_g: 2,
      specs: { frequencia_ghz: 5.8, polarizacao: "RHCP", conector: "MMCX" },
    }),
  videoReceiver: () =>
    makeComponent({
      categoria: "receptor_video",
      massa_g: 30,
      specs: { sistema: "analogico_5g8", interface: "usb_uvc", android: true },
    }),
};

export function item(
  slot: string,
  componente: Component,
  no_drone = 1,
  compra = no_drone,
): BuildItem {
  return { slot, componente, quantidade_no_drone: no_drone, quantidade_compra: compra };
}

export const THRUST_TABLE: ThrustData = thrustDataSchema.parse({
  id: "empuxo-teste",
  motor_id: "motor-teste",
  helice_id: "helice-teste",
  celulas: 3,
  pontos: [
    { throttle_pct: 25, empuxo_g: 120, corrente_a: 1 },
    { throttle_pct: 50, empuxo_g: 300, corrente_a: 3 },
    { throttle_pct: 75, empuxo_g: 600, corrente_a: 7 },
    { throttle_pct: 100, empuxo_g: 850, corrente_a: 11 },
  ],
  fontes: [{ titulo: "Tabela sintética de teste", tipo: "comunidade" }],
});

export const TEST_ARCHETYPE: Archetype = {
  id: "a1-gps-filmagem",
  nome: "Drone com GPS para filmar (teste)",
  descricao: "Arquétipo de teste.",
  para_quem: "Testes automatizados.",
  firmware: "ArduPilot",
  faixas: { helice_pol: [9, 11], celulas: [3, 4], massa_alvo_g: [800, 1500], twr_alvo: [2, 4] },
  slots: [
    { slot: "frame", categorias: ["frame"], quantidade: 1, obrigatorio: true, coberto_por: [] },
  ],
  orcamento_referencia_brl: { economica: 1500, equilibrada: 2500, premium: 4000 },
  passos: [],
  alertas: [],
  fontes: [],
};

export const TEST_FIRMWARE: FirmwareProfile = {
  id: "arducopter-teste",
  firmware: "ArduPilot",
  veiculo: "ArduCopter",
  versao_min: "4.7.0",
  verificado_em: "2026-10-04",
  parametros: [
    {
      nome: "FS_THR_ENABLE",
      valor: 1,
      explicacao: "perda do rádio → RTL",
      fontes: [SRC.ardupilotRadioFailsafe],
    },
    {
      nome: "BATT_FS_LOW_ACT",
      valor: 2,
      explicacao: "bateria baixa → RTL",
      fontes: [SRC.ardupilotBatteryFailsafe],
    },
    { nome: "FENCE_ENABLE", valor: 1, explicacao: "cerca ligada", fontes: [SRC.ardupilotFence] },
  ],
  notas: [],
};

export const BASE_OPTIONS: BuildOptions = {
  telemetria: "wifi_no_drone",
  controle: "radio",
  celular: "android",
  uso: "recreativo",
  oculos_fpv: false,
};

/** Build de 450 mm com GPS que passa em todas as regras. */
export function baseBuild(): Build {
  return {
    arquetipo_id: TEST_ARCHETYPE.id,
    opcoes: { ...BASE_OPTIONS },
    itens: [
      item("frame", parts.frame()),
      item("motores", parts.motor(), 4),
      item("helices", parts.prop(), 4, 8),
      item("escs", parts.esc(), 4),
      item("fc", parts.fc()),
      item("bateria", parts.battery(), 1, 2),
      item("conector", parts.connector()),
      item("receptor", parts.receiver()),
      item("radio", parts.radio()),
      item("gps", parts.gps()),
      item("mastro", parts.mast()),
      item("telemetria", parts.telemetry()),
      item("camera", parts.camera()),
      item("vtx", parts.vtx()),
      item("antena_video", parts.antenna()),
      item("receptor_video", parts.videoReceiver()),
    ],
  };
}

export function ctxFor(build: Build, over: Partial<ValidationContext> = {}): ValidationContext {
  return {
    build,
    archetype: TEST_ARCHETYPE,
    thrustTables: [THRUST_TABLE],
    config: DEFAULT_DRONE_CONFIG,
    firmwareProfile: TEST_FIRMWARE,
    ...over,
  };
}

/** Troca a peça de um slot por outra. */
export function replaceSlot(build: Build, slot: string, componente: Component): Build {
  return {
    ...build,
    itens: build.itens.map((i) => (i.slot === slot ? { ...i, componente } : i)),
  };
}

/** Aplica tweak() na peça de um slot. */
export function tweakSlot(
  build: Build,
  slot: string,
  specs: Record<string, unknown> = {},
  fields: Partial<Omit<Component, "categoria" | "specs">> = {},
): Build {
  return {
    ...build,
    itens: build.itens.map((i) =>
      i.slot === slot ? { ...i, componente: tweak(i.componente, specs, fields) } : i,
    ),
  };
}

export function removeSlot(build: Build, slot: string): Build {
  return { ...build, itens: build.itens.filter((i) => i.slot !== slot) };
}

/** Marca todas as peças do build com o mesmo selo. */
export function withStatus(build: Build, status: Component["status_verificacao"]): Build {
  return {
    ...build,
    itens: build.itens.map((i) => ({
      ...i,
      componente: tweak(i.componente, {}, { status_verificacao: status }),
    })),
  };
}
