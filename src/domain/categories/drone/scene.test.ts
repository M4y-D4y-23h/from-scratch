import { describe, expect, it } from "vitest";

import { baseBuild, TEST_ARCHETYPE, tweakSlot } from "./__fixtures__/builds";
import { computeCosts } from "./costs";
import type { DroneCatalog } from "./catalog";
import {
  buildDroneScene,
  type DroneScene,
  flyingItems,
  nodesForCategories,
  scenePartsInfo,
  type SceneNode,
} from "./scene";

/*
 * Cena 3D (SPEC B.11). Aceite da Fase 2: trocar a hélice de 5" para 3" ou o frame altera o
 * modelo. A cena é só desenho: os testes conferem que as medidas do catálogo chegam ao modelo,
 * que o sentido de giro bate com o firmware e que nada aproximado passa sem aviso.
 */

const ARDUPILOT = TEST_ARCHETYPE;
const BETAFLIGHT = { ...TEST_ARCHETYPE, firmware: "Betaflight" as const };

const node = (scene: DroneScene, id: string): SceneNode => {
  const n = scene.nos.find((x) => x.id === id);
  if (!n) throw new Error(`nó ${id} não está na cena`);
  return n;
};

function allNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") out.push(value);
  else if (Array.isArray(value)) for (const v of value) allNumbers(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) allNumbers(v, out);
  return out;
}

describe("cena 3D: aceite da Fase 2", () => {
  it('hélice de 5" para 3" muda o disco da hélice e a medida', () => {
    const cinco = buildDroneScene(
      tweakSlot(baseBuild(), "helices", { diametro_pol: 5 }),
      ARDUPILOT,
    );
    const tres = buildDroneScene(tweakSlot(baseBuild(), "helices", { diametro_pol: 3 }), ARDUPILOT);
    const raio = (s: DroneScene) => {
      const f = node(s, "helice-frente_direita").forma;
      return f.tipo === "helice" ? f.raio : NaN;
    };
    expect(raio(cinco)).toBe(63.5);
    expect(raio(tres)).toBe(38.1);
    expect(tres.medidas.find((m) => m.id === "helice")?.rotulo).toBe('Hélice: 3" (76,2 mm)');
    expect(cinco.medidas.find((m) => m.id === "helice")?.valor_mm).toBeCloseTo(127, 1);
  });

  it("trocar o frame muda a posição dos motores, os braços e o entre-eixos", () => {
    const grande = buildDroneScene(
      tweakSlot(baseBuild(), "frame", { distancia_entre_eixos_mm: 450 }),
      ARDUPILOT,
    );
    const pequeno = buildDroneScene(
      tweakSlot(baseBuild(), "frame", { distancia_entre_eixos_mm: 250 }),
      ARDUPILOT,
    );
    const x = (s: DroneScene) => node(s, "motor-frente_direita").posicao[0];
    // Motor a 45°: x = entre-eixos / 2 × cos 45°.
    expect(x(grande)).toBeCloseTo(159.1, 1);
    expect(x(pequeno)).toBeCloseTo(88.4, 1);
    const braco = (s: DroneScene) => {
      const f = node(s, "frame-braco-frente_direita").forma;
      return f.tipo === "caixa" ? f.tamanho[2] : NaN;
    };
    expect(braco(grande)).toBe(225);
    expect(braco(pequeno)).toBe(125);
    expect(pequeno.medidas.find((m) => m.id === "entre-eixos")?.rotulo).toBe("Entre-eixos: 250 mm");
  });
});

describe("cena 3D: motores", () => {
  it("ArduPilot Quad X: 1 frente-direita e 2 trás-esquerda giram anti-horário", () => {
    const s = buildDroneScene(baseBuild(), ARDUPILOT);
    const m = Object.fromEntries(s.motores.map((x) => [x.canto, x]));
    expect(m.frente_direita).toMatchObject({ numero: 1, sentido: "anti_horario" });
    expect(m.tras_esquerda).toMatchObject({ numero: 2, sentido: "anti_horario" });
    expect(m.frente_esquerda).toMatchObject({ numero: 3, sentido: "horario" });
    expect(m.tras_direita).toMatchObject({ numero: 4, sentido: "horario" });
    expect(s.fontes[0]?.url).toContain("AP_MotorsMatrix.cpp");
  });

  it("Betaflight Quad X (props in): 1 trás-direita, 2 frente-direita; mesmo sentido por canto", () => {
    const s = buildDroneScene(baseBuild(), BETAFLIGHT);
    const m = Object.fromEntries(s.motores.map((x) => [x.canto, x]));
    expect(m.tras_direita).toMatchObject({ numero: 1, sentido: "horario" });
    expect(m.frente_direita).toMatchObject({ numero: 2, sentido: "anti_horario" });
    expect(m.tras_esquerda).toMatchObject({ numero: 3, sentido: "anti_horario" });
    expect(m.frente_esquerda).toMatchObject({ numero: 4, sentido: "horario" });
    // A hélice gira no sentido do motor (a UI anima).
    expect(node(s, "helice-frente_esquerda").gira).toBe("horario");
  });

  it("a frente aponta para −Z e os motores da frente ficam em Z negativo", () => {
    const s = buildDroneScene(baseBuild(), ARDUPILOT);
    expect(s.frente.direcao).toEqual([0, 0, -1]);
    expect(node(s, "motor-frente_direita").posicao[2]).toBeLessThan(0);
    expect(node(s, "motor-frente_direita").posicao[0]).toBeGreaterThan(0);
  });

  it("motor sem medidas publicadas é desenhado pelo estator e marcado como aproximado", () => {
    const s = buildDroneScene(baseBuild(), ARDUPILOT);
    const motor = node(s, "motor-frente_direita");
    // Estator 2212: sino ≈ 22 × 1,27 = 27,9 mm; altura ≈ 12 + 22 × 0,55 = 24,1 mm.
    expect(motor.forma).toEqual({ tipo: "cilindro", raio: 14, altura: 24.1 });
    expect(motor.aproximado).toContain("estator 2212");
    const comMedida = buildDroneScene(
      tweakSlot(
        baseBuild(),
        "motores",
        {},
        {
          dimensoes_mm: { comprimento: 29, largura: 29, altura: 32 },
        },
      ),
      ARDUPILOT,
    );
    expect(node(comMedida, "motor-frente_direita").aproximado).toBeUndefined();
  });

  it("geometria que não é X fica aproximada e avisada", () => {
    const s = buildDroneScene(tweakSlot(baseBuild(), "frame", { geometria: "deadcat" }), ARDUPILOT);
    expect(s.avisos.join(" ")).toContain("Geometria deadcat");
    expect(node(s, "frame-braco-frente_direita").aproximado).toContain("deadcat");
  });
});

describe("cena 3D: peças e dados", () => {
  const build = baseBuild();
  const scene = buildDroneScene(build, ARDUPILOT);

  it("toda peça que voa aparece; rádio e outras peças de chão não", () => {
    const ids = new Set(scene.nos.map((n) => n.componente_id));
    for (const item of flyingItems(build)) {
      expect(ids.has(item.componente.id), item.slot).toBe(true);
    }
    expect(scene.nos.some((n) => n.categoria === "radio_tx")).toBe(false);
  });

  it("nenhum número quebrado (NaN ou infinito) e limites que envolvem o drone", () => {
    for (const n of allNumbers(scene)) expect(Number.isFinite(n)).toBe(true);
    expect(scene.limites.max[0]).toBeGreaterThan(scene.limites.min[0]);
  });

  it("vista explodida: hélices sobem mais que os motores", () => {
    const helice = node(scene, "helice-frente_direita").explosao[1];
    const motor = node(scene, "motor-frente_direita").explosao[1];
    expect(helice).toBeGreaterThan(motor);
    expect(motor).toBeGreaterThan(0);
  });

  it("fiação: bateria em vermelho e preto, sinais separados", () => {
    const tipos = new Set(scene.fios.map((f) => f.tipo));
    for (const t of ["positivo", "negativo", "motor", "radio", "gps"] as const) {
      expect(tipos.has(t), t).toBe(true);
    }
  });

  it("destaca as peças de um passo pelas categorias", () => {
    const ids = nodesForCategories(scene, ["motor"]);
    expect(ids).toHaveLength(4);
    expect(ids.every((id) => id.startsWith("motor-"))).toBe(true);
  });

  it("painel da peça: nome, função, preço, selo e onde comprar", () => {
    const catalog: DroneCatalog = {
      componentes: build.itens.map((i) => i.componente),
      empuxo: [],
      ferramentas: [],
      arquetipos: [ARDUPILOT],
      perfis_firmware: [],
      prontos: [],
    };
    const info = scenePartsInfo(build, computeCosts(build, ARDUPILOT, catalog));
    const motor = Object.values(info).find((p) => p.categoria === "motor");
    expect(motor).toMatchObject({ quantidade_no_drone: 4, selo: "nao_verificado" });
    expect(motor?.preco?.min_centavos).toBeGreaterThan(0);
    expect(motor?.onde_comprar.length).toBeGreaterThan(0);
    expect(Object.values(info).some((p) => p.categoria === "radio_tx")).toBe(false);
  });
});
