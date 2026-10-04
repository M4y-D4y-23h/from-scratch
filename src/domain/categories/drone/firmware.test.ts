import { describe, expect, it } from "vitest";

import { baseBuild, TEST_FIRMWARE } from "./__fixtures__/builds";
import { conditionMatches, resolveFirmwareParams } from "./firmware";
import { firmwareProfileSchema } from "./schema";

const fonte = [{ titulo: "teste", tipo: "documentacao_oficial" as const }];

const PROFILE = firmwareProfileSchema.parse({
  ...TEST_FIRMWARE,
  parametros: [
    { nome: "FS_THR_ENABLE", valor: 1, explicacao: "rádio", fontes: fonte },
    {
      nome: "BATT_LOW_MAH",
      calculo: { variavel: "capacidade_mah", fator: 0.2, casas: 0 },
      explicacao: "20% da capacidade",
      fontes: fonte,
    },
    {
      nome: "BATT_LOW_VOLT",
      calculo: { variavel: "celulas", fator: 3.5 },
      unidade: "V",
      explicacao: "3,5 V por célula",
      fontes: fonte,
    },
    {
      nome: "SERIAL1_PROTOCOL",
      valor: 2,
      explicacao: "MAVLink",
      condicao: { telemetria: ["elrs_mavlink"] },
      fontes: fonte,
    },
    {
      nome: "SERIAL1_PROTOCOL",
      valor: 23,
      explicacao: "CRSF",
      condicao: { telemetria: ["wifi_no_drone", "nenhuma"] },
      fontes: fonte,
    },
    {
      nome: "BRD_SAFETY_DEFLT",
      valor: 0,
      explicacao: "GPS sem botão de segurança",
      condicao: { tem_componente: ["gps-sem-botao"] },
      fontes: fonte,
    },
  ],
});

describe("parâmetros de firmware do projeto", () => {
  it("calcula os valores que dependem da bateria (3S 3000 mAh)", () => {
    const { parametros, faltando } = resolveFirmwareParams(PROFILE, baseBuild());
    expect(faltando).toEqual([]);
    const valor = (nome: string) => parametros.find((p) => p.nome === nome)?.valor;
    expect(valor("BATT_LOW_MAH")).toBe(600);
    expect(valor("BATT_LOW_VOLT")).toBe(10.5);
    expect(parametros.find((p) => p.nome === "BATT_LOW_VOLT")?.calculado).toBe(true);
  });

  it("aplica só os parâmetros cuja condição vale para o build", () => {
    const wifi = resolveFirmwareParams(PROFILE, baseBuild()).parametros;
    expect(wifi.find((p) => p.nome === "SERIAL1_PROTOCOL")?.valor).toBe(23);
    expect(wifi.some((p) => p.nome === "BRD_SAFETY_DEFLT")).toBe(false);

    const build = baseBuild();
    const mavlink = resolveFirmwareParams(PROFILE, {
      ...build,
      opcoes: { ...build.opcoes, telemetria: "elrs_mavlink" },
    }).parametros;
    expect(mavlink.find((p) => p.nome === "SERIAL1_PROTOCOL")?.valor).toBe(2);
  });

  it("sem bateria no build, os valores calculados ficam pendentes", () => {
    const build = baseBuild();
    const semBateria = { ...build, itens: build.itens.filter((i) => i.slot !== "bateria") };
    expect(resolveFirmwareParams(PROFILE, semBateria).faltando).toEqual([
      "BATT_LOW_MAH",
      "BATT_LOW_VOLT",
    ]);
  });

  it("perfil com valor e cálculo ao mesmo tempo é recusado", () => {
    expect(() =>
      firmwareProfileSchema.parse({
        ...TEST_FIRMWARE,
        parametros: [
          {
            nome: "X",
            valor: 1,
            calculo: { variavel: "celulas", fator: 1 },
            explicacao: "x",
            fontes: fonte,
          },
        ],
      }),
    ).toThrow();
  });

  it("condições por categoria e por peça", () => {
    expect(conditionMatches({ tem_categoria: ["gps"] }, baseBuild())).toBe(true);
    expect(conditionMatches({ sem_categoria: ["gps"] }, baseBuild())).toBe(false);
    expect(conditionMatches({ tem_componente: ["gps-teste"] }, baseBuild())).toBe(true);
  });
});
