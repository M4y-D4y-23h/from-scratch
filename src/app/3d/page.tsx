import { redirect } from "next/navigation";

import { referenceViewerParams } from "@/server/viewer/reference";

/** /3d abre o primeiro build de referência (Arquétipo 1, faixa econômica). */
export default function ViewerIndexPage() {
  const primeiro = referenceViewerParams()[0];
  if (!primeiro) redirect("/");
  redirect(`/3d/${primeiro.arquetipo}/${primeiro.faixa}`);
}
