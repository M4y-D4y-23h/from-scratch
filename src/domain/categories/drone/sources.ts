import type { Source } from "@/domain/core/source";

/*
 * Fontes oficiais citadas pelas regras e alertas. Todas as URLs foram abertas e conferidas na
 * data indicada (acessado_em). Se uma página mudar de endereço, atualize aqui.
 */

const ACESSO = "2026-10-04";

const ardupilot = (pagina: string, titulo: string): Source => ({
  titulo: `ArduPilot (Copter): ${titulo}`,
  tipo: "documentacao_oficial",
  url: `https://ardupilot.org/copter/docs/${pagina}.html`,
  acessado_em: ACESSO,
});

export const SRC = {
  spec: {
    titulo: "From Scratch: SPEC B.7 (heurísticas comuns da comunidade, configuráveis)",
    tipo: "comunidade",
    observacao: "Valores de referência da especificação do projeto; ajuste em config.ts.",
  } satisfies Source,
  ardupilotSafety: ardupilot("safety-multicopter", "Multicopter Safety"),
  ardupilotRtl: ardupilot("rtl-mode", "RTL Mode"),
  ardupilotRadioFailsafe: ardupilot("radio-failsafe", "Radio Failsafe"),
  ardupilotBatteryFailsafe: ardupilot("failsafe-battery", "Battery Failsafe"),
  ardupilotGcsFailsafe: ardupilot("gcs-failsafe", "GCS Failsafe"),
  ardupilotFence: ardupilot("common-ac2_simple_geofence", "Cylindrical Fence"),
  ardupilotFenceLanding: ardupilot("common-geofencing-landing-page", "Geofencing"),
  ardupilotGpsCompass: ardupilot(
    "common-installing-3dr-ublox-gps-compass-module",
    "GPS/Compass (mounting)",
  ),
  ardupilotMagInterference: ardupilot("common-magnetic-interference", "Magnetic Interference"),
  ardupilotCompassAdvanced: ardupilot("common-compass-setup-advanced", "Advanced Compass Setup"),
  ardupilotLimitedFirmware: ardupilot(
    "common-limited-firmware",
    "Firmware Limitations on AutoPilot Hardware",
  ),
  ardupilotAutopilots: ardupilot("common-autopilots", "Choosing an Autopilot"),
  ardupilotElrs: ardupilot("common-tbs-rc", "Crossfire and ELRS RC Systems"),
  ardupilotEsp32Telemetry: ardupilot("common-esp32-telemetry", "DroneBridge for ESP32"),
  ardupilotGcsOnly: ardupilot("common-gcs-only-operation", "Operation Using Only a GCS"),
  ardupilotChoosingFrame: ardupilot("choosing-a-frame", "Choosing a MultiCopter Frame"),
  ardupilotReleaseNotes: {
    titulo: "ArduCopter Release Notes (4.7: RTL_ALT → RTL_ALT_M, ARMING_CHECK → ARMING_SKIPCHK)",
    tipo: "documentacao_oficial",
    url: "https://github.com/ArduPilot/ardupilot/blob/e204ca77a8012342b52af17beb78adaca598113c/ArduCopter/ReleaseNotes.txt",
    acessado_em: ACESSO,
  } satisfies Source,
  betaflightConfigs: {
    titulo: "Betaflight: configurações oficiais das placas (repositório betaflight/config)",
    tipo: "documentacao_oficial",
    url: "https://github.com/betaflight/config/tree/15d8c3fa076e9f43e2135050c90265f7f3e92166/configs",
    acessado_em: ACESSO,
    observacao: "Commit 15d8c3f (02/10/2026). Cada placa tem configs/<FABRICANTE>/<ALVO>/config.h.",
  } satisfies Source,
  betaflightFailsafe: {
    titulo: "Betaflight: Failsafe (guia oficial)",
    tipo: "documentacao_oficial",
    url: "https://betaflight.com/docs/wiki/guides/current/Failsafe",
    acessado_em: ACESSO,
  } satisfies Source,
  betaflightSettings: {
    titulo: "Betaflight 2026.6.2: parâmetros do CLI (src/main/cli/settings.c)",
    tipo: "documentacao_oficial",
    url: "https://github.com/betaflight/betaflight/blob/e0b7bb01b17b21351057e9ead2d1ab39dd44fa16/src/main/cli/settings.c",
    acessado_em: ACESSO,
    observacao: "Nomes conferidos também na versão 4.5.3 (commit 0e533ba).",
  } satisfies Source,
  elrsMavlink: {
    titulo: "ExpressLRS: MAVLink",
    tipo: "documentacao_oficial",
    url: "https://www.expresslrs.org/software/mavlink/",
    acessado_em: ACESSO,
  } satisfies Source,
  qgcVirtualJoystick: {
    titulo: "QGroundControl: Virtual Joystick",
    tipo: "documentacao_oficial",
    url: "https://docs.qgroundcontrol.com/master/en/qgc-user-guide/settings_view/virtual_joystick.html",
    acessado_em: ACESSO,
  } satisfies Source,
  qgcInstall: {
    titulo: "QGroundControl: Download and Install (plataformas suportadas)",
    tipo: "documentacao_oficial",
    url: "https://docs.qgroundcontrol.com/master/en/qgc-user-guide/getting_started/download_and_install.html",
    acessado_em: ACESSO,
  } satisfies Source,
  qgcVideo: {
    titulo: "QGroundControl: Video settings (fontes de vídeo)",
    tipo: "documentacao_oficial",
    url: "https://docs.qgroundcontrol.com/master/en/qgc-user-guide/settings_view/video.html",
    acessado_em: ACESSO,
  } satisfies Source,
  anacRes806: {
    titulo:
      "ANAC: Resolução nº 806/2026 (UA até 250 g e aeromodelos em VLOS/EVLOS), DOU 16/06/2026",
    tipo: "norma",
    url: "https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2026/resolucao-806",
    acessado_em: ACESSO,
  } satisfies Source,
  anacRes805Rbac100: {
    titulo: "ANAC: Resolução nº 805/2026 (aprova o RBAC nº 100, substitui o RBAC-E nº 94)",
    tipo: "norma",
    url: "https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2026/resolucao-805",
    acessado_em: ACESSO,
  } satisfies Source,
  deceaIca10040: {
    titulo: "DECEA: ICA 100-40/2026 (Portaria nº 2.094/DNOR8, em vigor desde 01/07/2026)",
    tipo: "norma",
    url: "https://publicacoes.decea.mil.br/publicacao/ica-100-40",
    acessado_em: ACESSO,
  } satisfies Source,
  deceaPortal: {
    titulo: "DECEA: portal Drone/RPAS (SARPAS e perguntas frequentes)",
    tipo: "documentacao_oficial",
    url: "https://www.decea.mil.br/drone/",
    acessado_em: ACESSO,
  } satisfies Source,
  samu192: {
    titulo: "Ministério da Saúde: SAMU 192 (serviço gratuito, 24 horas)",
    tipo: "documentacao_oficial",
    url: "https://www.gov.br/saude/pt-br/composicao/saes/samu-192",
    acessado_em: ACESSO,
  } satisfies Source,
  anatelRestrita: {
    titulo: "Anatel: Ato nº 14.448/2017 (requisitos técnicos de equipamentos de radiação restrita)",
    tipo: "norma",
    url: "https://informacoes.anatel.gov.br/legislacao/atos-de-certificacao-de-produtos/2017/1139-",
    acessado_em: ACESSO,
  } satisfies Source,
  anatelHomologacao: {
    titulo: "Anatel: Homologar produtos de telecomunicações (serviço oficial)",
    tipo: "documentacao_oficial",
    url: "https://www.gov.br/pt-br/servicos/homologar-produtos-de-telecomunicacoes-anatel",
    acessado_em: ACESSO,
  } satisfies Source,
} as const;
