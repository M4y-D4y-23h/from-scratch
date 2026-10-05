import { redirect } from "next/navigation";

/** /3d abre o primeiro build de referência (Arquétipo 1, faixa econômica). */
export default function ViewerIndexPage() {
  redirect("/referencia/a1-gps-filmagem/economica");
}
