import { eq } from "drizzle-orm";

import type { Db } from "@/server/db";
import { ferramentasQueTenho } from "@/server/db/schema";

/*
 * "Já tenho esta ferramenta" (SPEC B.6): vale para todos os projetos (as ferramentas são da
 * pessoa, não do drone) e tira a ferramenta do custo.
 */

export function ownedTools(db: Db): Set<string> {
  return new Set(
    db
      .select({ id: ferramentasQueTenho.ferramenta_id })
      .from(ferramentasQueTenho)
      .all()
      .map((r) => r.id),
  );
}

export function setToolOwned(db: Db, ferramentaId: string, tenho: boolean, agora = new Date()) {
  if (tenho) {
    db.insert(ferramentasQueTenho)
      .values({ ferramenta_id: ferramentaId, criado_em: agora })
      .onConflictDoNothing()
      .run();
  } else {
    db.delete(ferramentasQueTenho).where(eq(ferramentasQueTenho.ferramenta_id, ferramentaId)).run();
  }
}
