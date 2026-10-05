import { redirect } from "next/navigation";

/*
 * Endereço da Fase 2. O 3D agora fica no centro da página do build de referência (SPEC B.12),
 * junto com os painéis: o link antigo continua funcionando.
 */
export default async function LegacyViewerPage(props: PageProps<"/3d/[arquetipo]/[faixa]">) {
  const { arquetipo, faixa } = await props.params;
  redirect(`/referencia/${arquetipo}/${faixa}`);
}
