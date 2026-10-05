import type { SceneMaterial, SpinDirection, WireKind } from "@/domain/categories/drone/scene";

/*
 * Cores do visualizador 3D. O domínio diz o "tipo" (material, fio, sentido); a cor é escolha de
 * interface e fica aqui, num lugar só, para o desenho e a legenda nunca discordarem.
 * O fundo do 3D é claro nos dois temas (como um programa de CAD), para o fio preto aparecer.
 */

export const MATERIAL_STYLE: Record<
  SceneMaterial,
  { cor: string; opacidade?: number; metal?: number; rugosidade?: number }
> = {
  carbono: { cor: "#2f343b", rugosidade: 0.55 },
  plastico: { cor: "#3d6fa8", rugosidade: 0.6 },
  metal: { cor: "#a3acb6", metal: 0.55, rugosidade: 0.35 },
  placa: { cor: "#1f7a4d", rugosidade: 0.5 },
  bateria: { cor: "#d1a52c", rugosidade: 0.5 },
  helice: { cor: "#e4572e", opacidade: 0.92 },
  fita: { cor: "#c2417f" },
  camera: { cor: "#16181d" },
  antena: { cor: "#26292f" },
  gps: { cor: "#eceff3" },
  conector: { cor: "#e8b730" },
  canopy: { cor: "#7cc6fe", opacidade: 0.45 },
};

export const WIRE_STYLE: Record<WireKind, { cor: string; rotulo: string }> = {
  positivo: { cor: "#dc2626", rotulo: "Potência + (vermelho)" },
  negativo: { cor: "#111827", rotulo: "Potência − (preto)" },
  motor: { cor: "#6b7280", rotulo: "Fios dos motores (potência)" },
  sinal_motor: { cor: "#a855f7", rotulo: "Sinal da controladora para os ESCs" },
  radio: { cor: "#ca8a04", rotulo: "Receptor do rádio (sinal)" },
  video: { cor: "#16a34a", rotulo: "Vídeo" },
  gps: { cor: "#2563eb", rotulo: "GPS e bússola (sinal)" },
};

export const SPIN_STYLE: Record<SpinDirection, { cor: string; rotulo: string; simbolo: string }> = {
  horario: { cor: "#0284c7", rotulo: "gira no sentido horário (visto de cima)", simbolo: "↻" },
  anti_horario: {
    cor: "#ea580c",
    rotulo: "gira no sentido anti-horário (visto de cima)",
    simbolo: "↺",
  },
};

export const HIGHLIGHT_COLOR = "#f59e0b";
export const SELECTED_EMISSIVE = "#2563eb";
export const MEASURE_COLOR = "#0f172a";
export const FRONT_COLOR = "#16a34a";
