import { LOCATION_KINDS, LOCATION_LABEL, type LocationKind } from "@/domain/core/location";

import type { Build } from "./build";
import type { DroneCatalog } from "./catalog";
import { toolsForBuild } from "./costs";
import { conditionMatches } from "./firmware";
import type { Archetype, WhereToBuy } from "./schema";

/*
 * "Onde fazer" (SPEC B.12): cada passo e cada compra classificados por local, com requisitos,
 * horas e ferramentas de cada um.
 */

const REQUISITOS: Record<LocationKind, string[]> = {
  comprar_pronto: [
    "Peças importadas levam semanas para chegar: compre tudo antes de começar.",
    "Links de compra são buscas por loja; confira se o anúncio é do modelo exato.",
  ],
  em_casa: [
    "Mesa firme de pelo menos 1 m, com tapete de silicone.",
    "Ventilação (janela aberta ou exaustor) para a fumaça da solda.",
    "Tomada para o ferro de solda e o carregador.",
    "Lugar para carregar a LiPo sobre superfície que não pega fogo, longe de coisas inflamáveis.",
  ],
  servico_externo: [
    "Impressão 3D ou corte CNC: serviços online, makerspaces/Fab Labs ou universidades.",
  ],
  espaco_aberto: [
    "Campo aberto, longe de pessoas que não participam do voo.",
    "Longe de aeroportos, helipontos e áreas restritas (confira no SARPAS do DECEA).",
    "Caminho de volta livre de árvores, fios e prédios (o retorno automático não desvia).",
    "Vento fraco e boa visibilidade: você precisa ver o drone o tempo todo.",
  ],
};

export type LocationGroup = {
  local: LocationKind;
  simbolo: string;
  rotulo: string;
  requisitos: string[];
  passos: Array<{ id: string; titulo: string }>;
  horas: [number, number];
  ferramentas: string[];
  /** Para "comprar": cada peça e onde procurar (tipo de loja + termo de busca). */
  compras?: Array<{ id: string; nome: string; onde: WhereToBuy[] }>;
  /** Ids de alertas que valem para este local. */
  alertas: string[];
};

const horas = (minutos: number) => Math.round((minutos / 60) * 10) / 10;

export function computeLocations(
  build: Build,
  archetype: Archetype,
  catalog: DroneCatalog,
): LocationGroup[] {
  const passos = archetype.passos.filter((p) => conditionMatches(p.condicao, build));
  const tools = new Map(toolsForBuild(build, archetype, catalog).map((t) => [t.id, t.nome]));
  const grupos: LocationGroup[] = [];
  for (const local of LOCATION_KINDS) {
    const doLocal = passos.filter((p) => p.local === local);
    const compras =
      local === "comprar_pronto"
        ? build.itens
            .filter((i) => !i.fornecido_por)
            .map((i) => ({
              id: i.componente.id,
              nome: `${i.componente.marca} ${i.componente.modelo}`,
              onde: i.componente.onde_comprar,
            }))
        : undefined;
    // Serviço externo só aparece quando algum passo precisa dele.
    if (doLocal.length === 0 && !compras) {
      if (local === "servico_externo") continue;
    }
    const ferramentas = [
      ...new Set(doLocal.flatMap((p) => p.ferramentas.flatMap((f) => tools.get(f) ?? []))),
    ];
    grupos.push({
      local,
      simbolo: LOCATION_LABEL[local].simbolo,
      rotulo: LOCATION_LABEL[local].rotulo,
      requisitos: REQUISITOS[local],
      passos: doLocal.map((p) => ({ id: p.id, titulo: p.titulo })),
      horas: [
        horas(doLocal.reduce((s, p) => s + p.tempo_min[0], 0)),
        horas(doLocal.reduce((s, p) => s + p.tempo_min[1], 0)),
      ],
      ferramentas,
      compras,
      alertas: local === "espaco_aberto" ? ["regulamentacao"] : [],
    });
  }
  return grupos;
}
