import { createHash } from "node:crypto";

import { type DroneConfig, DEFAULT_DRONE_CONFIG } from "@/domain/categories/drone/config";
import type { Archetype } from "@/domain/categories/drone/schema";
import { solve, type SolverInput, type SolverResult } from "@/domain/categories/drone/solver";
import { memo } from "@/server/cache/memo";
import type { LoadedCatalog } from "@/server/catalog/load";

/*
 * O solver é a conta mais cara do app (combina peças e roda as regras em cada combinação) e é
 * usado pela página inicial, pelo /catalogo e por toda página de projeto. Com o mesmo catálogo e
 * as mesmas opções o resultado é igual, então ele é guardado na memória do servidor (memo.ts).
 */

/** Identifica a configuração do motor de cálculo na chave da memória. */
export function configKey(config: DroneConfig): string {
  if (config === DEFAULT_DRONE_CONFIG) return "padrao";
  return createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 16);
}

/** "já tenho" na chave da memória (a ordem não importa). */
export function ownedKey(owned: ReadonlySet<string> | undefined): string {
  return owned && owned.size > 0 ? [...owned].sort().join(",") : "-";
}

export function solveCached(
  loaded: LoadedCatalog,
  archetype: Archetype,
  options: Omit<SolverInput, "archetype" | "catalog" | "config"> & { config?: DroneConfig } = {},
): SolverResult {
  const config = options.config ?? DEFAULT_DRONE_CONFIG;
  const chave = [
    "solve",
    loaded.hash,
    archetype.id,
    configKey(config),
    JSON.stringify(options.opcoes ?? {}),
    ownedKey(options.ferramentasQueTenho),
  ].join("|");
  return memo(chave, () =>
    solve({
      archetype,
      catalog: loaded.catalog,
      config,
      opcoes: options.opcoes,
      ferramentasQueTenho: options.ferramentasQueTenho,
    }),
  );
}
