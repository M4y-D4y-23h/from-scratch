import { describe, expect, it } from "vitest";

import { DEFAULT_DRONE_CONFIG } from "@/domain/categories/drone/config";
import { buildDroneScene, type DroneScene, flyingItems } from "@/domain/categories/drone/scene";
import { solve } from "@/domain/categories/drone/solver";
import { loadDroneCatalog } from "@/server/catalog/load";

/*
 * Cena 3D dos 9 builds de referência (3 arquétipos × 3 faixas) com o catálogo real: as medidas
 * publicadas chegam ao modelo e cada arquétipo fica com a cara que tem na vida real.
 */

const { catalog } = loadDroneCatalog();
const config = DEFAULT_DRONE_CONFIG;

function scenesOf(id: string): DroneScene[] {
  const archetype = catalog.arquetipos.find((a) => a.id === id);
  if (!archetype) throw new Error(`arquétipo ${id} não está no catálogo`);
  return solve({ archetype, catalog, config }).faixas.map((p) =>
    buildDroneScene(p.build, archetype),
  );
}

const byId = (s: DroneScene, id: string) => s.nos.find((n) => n.id === id);

describe("cena 3D dos builds de referência", () => {
  for (const id of ["a1-gps-filmagem", "a2-fpv-5pol", "a3-tiny-whoop"]) {
    it(`${id}: 4 motores, 4 hélices, bateria e toda peça que voa`, () => {
      const archetype = catalog.arquetipos.find((a) => a.id === id)!;
      for (const plano of solve({ archetype, catalog, config }).faixas) {
        const s = buildDroneScene(plano.build, archetype);
        expect(s.nos.filter((n) => n.categoria === "motor")).toHaveLength(4);
        expect(s.nos.filter((n) => n.forma.tipo === "helice")).toHaveLength(4);
        expect(byId(s, "bateria")).toBeDefined();
        const ids = new Set(s.nos.map((n) => n.componente_id));
        for (const item of flyingItems(plano.build)) {
          expect(ids.has(item.componente.id), `${plano.faixa}: ${item.slot}`).toBe(true);
        }
      }
    });
  }

  it('Arquétipo 1 (X500): 500 mm, hélice de 10", GPS no mastro de 108 mm e bateria embaixo', () => {
    for (const s of scenesOf("a1-gps-filmagem")) {
      expect(s.medidas.find((m) => m.id === "entre-eixos")?.valor_mm).toBe(500);
      expect(s.medidas.find((m) => m.id === "helice")?.valor_mm).toBeCloseTo(254, 0);
      expect(s.medidas.find((m) => m.id === "mastro-gps")?.valor_mm).toBe(108);
      // Placa central de 144 mm (fabricante), sem aviso de tamanho aproximado.
      const placa = byId(s, "frame-placa-baixo");
      expect(placa?.forma).toMatchObject({ tipo: "caixa", tamanho: [144, 4, 144] });
      expect(placa?.aproximado).toBeUndefined();
      // Bateria 136 x 44 x 30 mm (CNHL) embaixo, entre o trem de pouso.
      expect(byId(s, "bateria")?.forma).toEqual({ tipo: "caixa", tamanho: [44, 30, 136] });
      expect(byId(s, "bateria")!.posicao[1]).toBeLessThan(0);
      expect(s.motores.find((m) => m.canto === "frente_direita")?.numero).toBe(1);
      // ESC de cada motor no braço, como no kit X500 V2.
      expect(s.nos.filter((n) => n.categoria === "esc")).toHaveLength(4);
    }
  });

  it('Arquétipo 2 (5"): DeadCat aproximado, bateria em cima com os 2 straps do frame', () => {
    for (const s of scenesOf("a2-fpv-5pol")) {
      expect(s.avisos.join(" ")).toContain("Geometria deadcat");
      const bateria = byId(s, "bateria")!;
      const placaCima = byId(s, "frame-placa-cima")!;
      expect(bateria.posicao[1]).toBeGreaterThan(placaCima.posicao[1]);
      expect(byId(s, "strap-bateria")?.nota).toContain("2 straps");
      // Stack 20 x 20: quatro espaçadores na furação real.
      const espacadores = s.nos.filter((n) => n.id.startsWith("stack-espacador"));
      expect(espacadores.map((n) => Math.abs(n.posicao[0]))).toEqual([10, 10, 10, 10]);
      // VTX entre as placas, abaixo da bateria.
      expect(byId(s, "vtx")!.posicao[1]).toBeLessThan(placaCima.posicao[1]);
      expect(s.motores.find((m) => m.canto === "tras_direita")?.numero).toBe(1);
    }
  });

  it("Arquétipo 3 (whoop): dutos nas hélices, bateria no encaixe e sem strap", () => {
    for (const s of scenesOf("a3-tiny-whoop")) {
      expect(s.nos.filter((n) => n.forma.tipo === "anel")).toHaveLength(4);
      expect(byId(s, "bateria")!.posicao[1]).toBeLessThan(0);
      expect(byId(s, "strap-bateria")).toBeUndefined();
      // VTX embutido na AIO: não há nó de VTX separado, mas a antena está lá.
      expect(byId(s, "vtx")).toBeUndefined();
      expect(byId(s, "antena-video")).toBeDefined();
    }
  });
});
