"use client";

import dynamic from "next/dynamic";
import { useCallback, useId, useMemo, useState } from "react";

import type { Build } from "@/domain/categories/drone/build";
import {
  buildDroneScene,
  type DroneScene,
  nodesForCategories,
  type ScenePartInfo,
} from "@/domain/categories/drone/scene";
import type { WhereToBuy } from "@/domain/categories/drone/schema";
import { formatRange } from "@/domain/core/money";
import { SEAL } from "@/domain/core/verification";
import type { ViewerData } from "@/server/viewer/reference";

import { HIGHLIGHT_COLOR, SPIN_STYLE, WIRE_STYLE } from "./colors";

// O three.js só roda no navegador (WebGL): o canvas não é pré-renderizado no servidor.
const DroneCanvas = dynamic(() => import("./drone-canvas"), {
  ssr: false,
  loading: () => (
    <p className="flex h-full items-center justify-center text-sm text-slate-600">
      Carregando o 3D…
    </p>
  ),
});

const WHERE_TO_BUY_LABEL: Record<WhereToBuy["tipo_loja"], string> = {
  marketplace_nacional: "lojas on-line do Brasil",
  importacao: "importação",
  loja_hobby_robotica: "lojas de hobby e robótica",
  loja_ferramentas: "lojas de ferramentas",
  fabricante: "loja do fabricante",
};

const PROP_SIZES = ["3", "4", "5", "6", "7", "10"];

type Mostrar = { fiacao: boolean; medidas: boolean; giro: boolean; animar: boolean };

export function ViewerShell({ data }: { data: ViewerData }) {
  const ids = useId();
  const [explosao, setExplosao] = useState(0);
  const [mostrar, setMostrar] = useState<Mostrar>({
    fiacao: true,
    medidas: true,
    giro: true,
    animar: false,
  });
  const [passo, setPasso] = useState("");
  const [selecionado, setSelecionado] = useState<{ componente?: string; no: string }>();
  const [heliceSim, setHeliceSim] = useState("");
  const [frameSim, setFrameSim] = useState("");
  const [pronto, setPronto] = useState(false);

  const build = useMemo(
    () => experimentBuild(data, heliceSim, frameSim),
    [data, heliceSim, frameSim],
  );
  const scene = useMemo(
    () => buildDroneScene(build, { firmware: data.arquetipo.firmware }),
    [build, data.arquetipo.firmware],
  );
  const destaque = useMemo(() => {
    const step = data.passos.find((p) => p.id === passo);
    return new Set(step ? nodesForCategories(scene, step.pecas) : []);
  }, [data.passos, passo, scene]);

  const onSelect = useCallback((componente: string | undefined, no: string) => {
    setSelecionado({ componente, no });
  }, []);
  const onReady = useCallback(() => setPronto(true), []);

  const simulando = heliceSim !== "" || frameSim !== "";
  const pecasNaCena = uniqueParts(scene);
  const noSelecionado = scene.nos.find((n) => n.id === selecionado?.no);
  const parte = selecionado?.componente
    ? (data.partes[selecionado.componente] ?? experimentPart(data, selecionado.componente))
    : undefined;
  const heliceAtual = data.build.itens.find((i) => i.componente.categoria === "helice")?.componente;
  const helicePol =
    heliceAtual?.categoria === "helice" ? heliceAtual.specs.diametro_pol : undefined;

  const toggle = (k: keyof Mostrar) => setMostrar((m) => ({ ...m, [k]: !m[k] }));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        {simulando && (
          <p
            role="status"
            className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
          >
            <strong>Simulação só do desenho.</strong> As regras de compatibilidade, o peso e os
            custos não foram recalculados para esta troca (isso chega na Fase 3).
          </p>
        )}
        <div
          data-testid="visualizador-3d"
          data-pronto={pronto ? "sim" : "nao"}
          role="img"
          aria-label={`Modelo 3D de ${data.arquetipo.nome}, em escala real. Arraste para girar e use a roda do mouse para aproximar.`}
          className="relative h-[60vh] min-h-80 overflow-hidden rounded-lg border bg-gradient-to-b from-slate-100 to-slate-300"
        >
          <DroneCanvas
            scene={scene}
            explosao={explosao}
            mostrar={mostrar}
            destaque={destaque}
            selecionado={selecionado?.componente}
            onSelect={onSelect}
            onReady={onReady}
          />
        </div>

        <fieldset className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold">Controles</legend>
          <label className="space-y-1 text-sm sm:col-span-2" htmlFor={`${ids}-explosao`}>
            <span className="font-medium">Vista explodida: {Math.round(explosao * 100)}%</span>
            <input
              id={`${ids}-explosao`}
              type="range"
              min={0}
              max={100}
              value={Math.round(explosao * 100)}
              onChange={(e) => setExplosao(Number(e.target.value) / 100)}
              className="w-full accent-primary"
            />
          </label>
          <div className="space-y-2 text-sm">
            <Check checked={mostrar.fiacao} onChange={() => toggle("fiacao")}>
              Fiação simplificada (com o drone montado)
            </Check>
            <Check checked={mostrar.medidas} onChange={() => toggle("medidas")}>
              Medidas
            </Check>
            <Check checked={mostrar.giro} onChange={() => toggle("giro")}>
              Número e sentido de giro dos motores
            </Check>
            <Check checked={mostrar.animar} onChange={() => toggle("animar")}>
              Girar as hélices
            </Check>
          </div>
          <label className="space-y-1 text-sm" htmlFor={`${ids}-passo`}>
            <span className="font-medium">Destacar as peças do passo</span>
            <select
              id={`${ids}-passo`}
              value={passo}
              onChange={(e) => setPasso(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5"
            >
              <option value="">Nenhum</option>
              {data.passos
                .filter((p) => p.pecas.length > 0)
                .map((p, i) => (
                  <option key={p.id} value={p.id}>
                    {i + 1}. {p.titulo}
                  </option>
                ))}
            </select>
          </label>
        </fieldset>

        <fieldset className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold">Experimentar (só o desenho)</legend>
          <label className="space-y-1 text-sm" htmlFor={`${ids}-helice`}>
            <span className="font-medium">Diâmetro da hélice</span>
            <select
              id={`${ids}-helice`}
              value={heliceSim}
              onChange={(e) => setHeliceSim(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5"
            >
              <option value="">Do projeto{helicePol ? ` (${fmt(helicePol)}")` : ""}</option>
              {PROP_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}&quot;
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm" htmlFor={`${ids}-frame`}>
            <span className="font-medium">Frame do catálogo</span>
            <select
              id={`${ids}-frame`}
              value={frameSim}
              onChange={(e) => setFrameSim(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5"
            >
              <option value="">Do projeto</option>
              {data.alternativas.frames.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.marca} {f.modelo}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        {scene.avisos.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {scene.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
      </div>

      <aside className="space-y-6" aria-label="Detalhes do modelo">
        <section aria-labelledby={`${ids}-painel`} className="rounded-lg border p-4">
          <h2 id={`${ids}-painel`} className="text-base font-semibold">
            {parte ? parte.nome : "Clique numa peça"}
          </h2>
          {parte ? (
            <PartDetails
              parte={parte}
              aproximado={noSelecionado?.aproximado}
              nota={noSelecionado?.nota}
            />
          ) : noSelecionado ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {noSelecionado.rotulo}
              {noSelecionado.nota ? ` ${noSelecionado.nota}` : ""}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Clique numa peça do 3D (ou escolha na lista abaixo) para ver para que ela serve, o
              preço, o selo de confiança e onde comprar.
            </p>
          )}
        </section>

        <section aria-labelledby={`${ids}-pecas`} className="rounded-lg border p-4">
          <h2 id={`${ids}-pecas`} className="text-base font-semibold">
            Peças no modelo
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {pecasNaCena.map((p) => (
              <li key={p.componente}>
                <button
                  type="button"
                  onClick={() => setSelecionado({ componente: p.componente, no: p.no })}
                  aria-pressed={selecionado?.componente === p.componente}
                  className="w-full rounded px-2 py-1 text-left hover:bg-accent aria-pressed:bg-accent aria-pressed:font-medium"
                >
                  {data.partes[p.componente]?.nome ??
                    experimentPart(data, p.componente)?.nome ??
                    p.rotulo}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby={`${ids}-legenda`} className="rounded-lg border p-4 text-sm">
          <h2 id={`${ids}-legenda`} className="text-base font-semibold">
            Legenda
          </h2>
          <ul className="mt-2 space-y-1">
            {Object.values(WIRE_STYLE).map((w) => (
              <li key={w.rotulo} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-1 w-6 rounded"
                  style={{ background: w.cor }}
                />
                {w.rotulo}
              </li>
            ))}
            {Object.values(SPIN_STYLE).map((s) => (
              <li key={s.rotulo} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="w-6 text-center font-bold"
                  style={{ color: s.cor }}
                >
                  {s.simbolo}
                </span>
                Motor que {s.rotulo}
              </li>
            ))}
            <li className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-3 w-6 rounded"
                style={{ background: HIGHLIGHT_COLOR }}
              />
              Peças do passo destacado
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Número e sentido dos motores conforme o {data.arquetipo.firmware}
            {scene.fontes[0] ? ` (${scene.fontes[0].titulo})` : ""}. Medidas em milímetros.
          </p>
        </section>
      </aside>
    </div>
  );
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-4 accent-primary"
      />
      {children}
    </label>
  );
}

function PartDetails({
  parte,
  aproximado,
  nota,
}: {
  parte: ScenePartInfo;
  aproximado?: string;
  nota?: string;
}) {
  const selo = SEAL[parte.selo];
  return (
    <dl className="mt-2 space-y-2 text-sm">
      <div>
        <dt className="sr-only">Para que serve</dt>
        <dd>{parte.descricao_leiga}</dd>
      </div>
      <div className="flex gap-2">
        <dt className="font-medium">Selo:</dt>
        <dd>
          <span aria-hidden="true">{selo.simbolo}</span> {selo.rotulo}
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="font-medium">No drone:</dt>
        <dd>
          {parte.quantidade_no_drone} (comprar {parte.quantidade_compra})
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="font-medium">Preço:</dt>
        <dd>
          {parte.vem_com
            ? `vem na caixa de ${parte.vem_com}`
            : parte.preco
              ? `${formatRange(parte.preco)} (⚠️ estimativa, ${dataBr(parte.preco.data_mais_antiga)})`
              : "sem preço pesquisado"}
        </dd>
      </div>
      {parte.massa_g !== undefined && (
        <div className="flex gap-2">
          <dt className="font-medium">Massa:</dt>
          <dd>
            {fmt(parte.massa_g)} g{parte.massa_estimada ? " (estimada)" : ""}
          </dd>
        </div>
      )}
      {parte.onde_comprar.length > 0 && (
        <div>
          <dt className="font-medium">Onde procurar:</dt>
          <dd>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {parte.onde_comprar.map((w) => (
                <li key={`${w.tipo_loja}-${w.termo_busca}`}>
                  &ldquo;{w.termo_busca}&rdquo; em {WHERE_TO_BUY_LABEL[w.tipo_loja]}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      )}
      {aproximado && (
        <div className="rounded-md bg-muted p-2 text-xs">
          <dt className="font-medium">Forma aproximada no 3D</dt>
          <dd>{aproximado}</dd>
        </div>
      )}
      {nota && (
        <div className="text-xs">
          <dt className="sr-only">Observação</dt>
          <dd>{nota}</dd>
        </div>
      )}
    </dl>
  );
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** "2026-10-02" → "02/10/2026". */
function dataBr(iso: string | undefined): string {
  if (!iso) return "sem data";
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/** Peças distintas da cena, na ordem em que aparecem (uma linha por peça do catálogo). */
function uniqueParts(scene: DroneScene): Array<{ componente: string; no: string; rotulo: string }> {
  const vistos = new Set<string>();
  const out: Array<{ componente: string; no: string; rotulo: string }> = [];
  for (const n of scene.nos) {
    if (!n.componente_id || vistos.has(n.componente_id)) continue;
    vistos.add(n.componente_id);
    out.push({ componente: n.componente_id, no: n.id, rotulo: n.rotulo });
  }
  return out;
}

/** Troca o frame e/ou o diâmetro da hélice só para o desenho (sem revalidar o projeto). */
function experimentBuild(data: ViewerData, heliceSim: string, frameSim: string): Build {
  const frame = frameSim ? data.alternativas.frames.find((c) => c.id === frameSim) : undefined;
  const diametro = heliceSim ? Number(heliceSim) : undefined;
  if (!frame && !diametro) return data.build;
  return {
    ...data.build,
    itens: data.build.itens.map((item) => {
      const c = item.componente;
      if (frame && c.categoria === "frame") return { ...item, componente: frame };
      if (diametro && c.categoria === "helice") {
        return {
          ...item,
          componente: {
            ...c,
            id: `${c.id}-simulada`,
            specs: { ...c.specs, diametro_pol: diametro },
          },
        };
      }
      return item;
    }),
  };
}

/** Painel de uma peça do "experimentar" (fora do projeto: sem preço do projeto). */
function experimentPart(data: ViewerData, id: string): ScenePartInfo | undefined {
  const frame = data.alternativas.frames.find((c) => c.id === id);
  const original = data.build.itens.find((i) => `${i.componente.id}-simulada` === id)?.componente;
  const c = frame ?? original;
  if (!c) return undefined;
  return {
    id,
    nome: frame
      ? `${c.marca} ${c.modelo} (simulação)`
      : `${c.marca} ${c.modelo} com outro diâmetro (simulação)`,
    categoria: c.categoria,
    descricao_leiga: c.descricao_leiga,
    quantidade_no_drone: 0,
    quantidade_compra: 0,
    selo: c.status_verificacao,
    onde_comprar: c.onde_comprar,
    massa_g: c.massa_g,
    massa_estimada: false,
    fontes: c.fontes,
  };
}
