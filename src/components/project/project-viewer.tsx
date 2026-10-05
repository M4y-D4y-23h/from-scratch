"use client";

import { ArrowLeftRight, Eye, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useId, useMemo, useState } from "react";

import { fmt, priceWithDate } from "@/components/format";
import { Glossed } from "@/components/glossary/glossary";
import { Seal } from "@/components/seal";
import { Button } from "@/components/ui/button";
import { HIGHLIGHT_COLOR, SPIN_STYLE, WIRE_STYLE } from "@/components/viewer3d/colors";
import { WHERE_TO_BUY_LABEL } from "@/domain/categories/drone/bom";
import type { Build } from "@/domain/categories/drone/build";
import {
  buildDroneScene,
  type DroneScene,
  nodesForCategories,
  type ScenePartInfo,
} from "@/domain/categories/drone/scene";
import type { Component, Firmware } from "@/domain/categories/drone/schema";

import { useWorkspace } from "./workspace";

/*
 * O 3D no centro da página do projeto (SPEC B.11/B.12). Reaproveita o desenho da Fase 2
 * (DroneCanvas) e conversa com as abas: "ver no 3D" na lista de peças seleciona a peça aqui, e os
 * passos/regras destacam as peças envolvidas. Nenhuma medida é calculada aqui: a cena vem do
 * domínio (scene.ts).
 */

// O three.js só roda no navegador (WebGL): o canvas não é pré-renderizado no servidor.
const DroneCanvas = dynamic(() => import("@/components/viewer3d/drone-canvas"), {
  ssr: false,
  loading: () => (
    <p className="flex h-full items-center justify-center text-sm text-slate-600">
      Carregando o 3D…
    </p>
  ),
});

const PROP_SIZES = ["3", "4", "5", "6", "7", "10"];

type Mostrar = { fiacao: boolean; medidas: boolean; giro: boolean; animar: boolean };

export type ProjectViewerProps = {
  nome: string;
  firmware: Firmware;
  build: Build;
  partes: Record<string, ScenePartInfo>;
  passos: Array<{ id: string; titulo: string; pecas: string[] }>;
  /** Frames do catálogo para o "experimentar" (só o desenho). */
  frames: Component[];
  /** Peça → slot que tem alternativas compatíveis (para o botão "Trocar"). */
  trocaveis: Record<string, string>;
};

export function ProjectViewer(props: ProjectViewerProps) {
  const ids = useId();
  const ws = useWorkspace();
  const [explosao, setExplosao] = useState(0);
  const [mostrar, setMostrar] = useState<Mostrar>({
    fiacao: true,
    medidas: true,
    giro: true,
    animar: false,
  });
  const [no, setNo] = useState<string>();
  const [heliceSim, setHeliceSim] = useState("");
  const [frameSim, setFrameSim] = useState("");
  const [pronto, setPronto] = useState(false);

  const build = useMemo(
    () => experimentBuild(props.build, props.frames, heliceSim, frameSim),
    [props.build, props.frames, heliceSim, frameSim],
  );
  const scene = useMemo(
    () => buildDroneScene(build, { firmware: props.firmware }),
    [build, props.firmware],
  );
  const destaque = useMemo(() => {
    const d = ws.destaque;
    if (!d) return new Set<string>();
    const porCategoria = d.categorias ? nodesForCategories(scene, d.categorias) : [];
    const porPeca = d.componentes
      ? scene.nos
          .filter((n) => n.componente_id && d.componentes?.includes(n.componente_id))
          .map((n) => n.id)
      : [];
    return new Set([...porCategoria, ...porPeca]);
  }, [ws.destaque, scene]);

  const { selecionar } = ws;
  const onSelect = useCallback(
    (componente: string | undefined, noId: string) => {
      setNo(noId);
      selecionar(componente);
    },
    [selecionar],
  );
  const onReady = useCallback(() => setPronto(true), []);

  const simulando = heliceSim !== "" || frameSim !== "";
  const pecasNaCena = uniqueParts(scene);
  const noSelecionado =
    scene.nos.find((n) => n.id === no && n.componente_id === ws.selecionado) ??
    scene.nos.find((n) => n.componente_id !== undefined && n.componente_id === ws.selecionado);
  const parte = ws.selecionado
    ? (props.partes[ws.selecionado] ?? experimentPart(props, ws.selecionado))
    : undefined;
  const helice = props.build.itens.find((i) => i.componente.categoria === "helice")?.componente;
  const helicePol = helice?.categoria === "helice" ? helice.specs.diametro_pol : undefined;
  const slotTroca = ws.selecionado ? props.trocaveis[ws.selecionado] : undefined;
  const toggle = (k: keyof Mostrar) => setMostrar((m) => ({ ...m, [k]: !m[k] }));
  const passoAtual = props.passos.find((p) => `Passo: ${p.titulo}` === ws.destaque?.rotulo);

  return (
    <section id="visualizador" aria-labelledby={`${ids}-titulo`} className="space-y-3">
      <h2 id={`${ids}-titulo`} className="sr-only">
        Modelo 3D em escala real
      </h2>
      {simulando && (
        <p
          role="status"
          className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <strong>Simulação só do desenho.</strong> As regras, o peso e os custos não mudam com o
          &ldquo;experimentar&rdquo;. Para trocar de verdade, com tudo recalculado, use
          &ldquo;Trocar&rdquo; na aba Peças e Custos.
        </p>
      )}
      {ws.destaque && (
        <div
          role="status"
          className="flex items-start justify-between gap-2 rounded-md border bg-amber-50 p-2 pl-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <p>
            <span
              aria-hidden="true"
              className="mr-2 inline-block size-3 rounded-sm align-middle"
              style={{ background: HIGHLIGHT_COLOR }}
            />
            Destacando: {ws.destaque.rotulo}
            {destaque.size === 0 && " (nenhuma dessas peças aparece no 3D)"}
          </p>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => ws.destacar(undefined)}
            aria-label="Parar de destacar"
          >
            <X />
          </Button>
        </div>
      )}

      <div
        data-testid="visualizador-3d"
        data-pronto={pronto ? "sim" : "nao"}
        role="img"
        aria-label={`Modelo 3D de ${props.nome}, em escala real. Arraste para girar e use a roda do mouse para aproximar.`}
        className="relative h-[52vh] min-h-80 overflow-hidden rounded-xl border bg-gradient-to-b from-slate-100 to-slate-300 shadow-inner"
      >
        <DroneCanvas
          scene={scene}
          explosao={explosao}
          mostrar={mostrar}
          destaque={destaque}
          selecionado={ws.selecionado}
          onSelect={onSelect}
          onReady={onReady}
        />
        <p className="pointer-events-none absolute bottom-2 left-3 text-xs text-slate-600">
          Arraste para girar · roda do mouse para aproximar · clique numa peça
        </p>
      </div>

      <fieldset className="grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-2">
        <legend className="px-1 font-semibold">Controles do 3D</legend>
        <label className="space-y-1 sm:col-span-2" htmlFor={`${ids}-explosao`}>
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
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:col-span-2">
          <Check checked={mostrar.fiacao} onChange={() => toggle("fiacao")}>
            Fiação simplificada
          </Check>
          <Check checked={mostrar.medidas} onChange={() => toggle("medidas")}>
            Medidas
          </Check>
          <Check checked={mostrar.giro} onChange={() => toggle("giro")}>
            Sentido dos motores
          </Check>
          <Check checked={mostrar.animar} onChange={() => toggle("animar")}>
            Girar as hélices
          </Check>
        </div>
        <label className="space-y-1 sm:col-span-2" htmlFor={`${ids}-passo`}>
          <span className="font-medium">Destacar as peças do passo</span>
          <select
            id={`${ids}-passo`}
            value={passoAtual?.id ?? ""}
            onChange={(e) => {
              const passo = props.passos.find((p) => p.id === e.target.value);
              ws.destacar(
                passo ? { rotulo: `Passo: ${passo.titulo}`, categorias: passo.pecas } : undefined,
              );
            }}
            className="w-full rounded-md border bg-background px-2 py-1.5"
          >
            <option value="">Nenhum</option>
            {props.passos
              .filter((p) => p.pecas.length > 0)
              .map((p, i) => (
                <option key={p.id} value={p.id}>
                  {i + 1}. {p.titulo}
                </option>
              ))}
          </select>
        </label>
      </fieldset>

      <aside aria-label="Detalhes do modelo" className="rounded-lg border p-4">
        <h3 className="text-base font-semibold">{parte ? parte.nome : "Clique numa peça"}</h3>
        {parte ? (
          <>
            <PartDetails
              parte={parte}
              aproximado={noSelecionado?.aproximado}
              nota={noSelecionado?.nota}
            />
            {slotTroca && !simulando && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => ws.abrirTroca(slotTroca)}
              >
                <ArrowLeftRight aria-hidden="true" /> Trocar esta peça
              </Button>
            )}
          </>
        ) : noSelecionado ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {noSelecionado.rotulo}
            {noSelecionado.nota ? ` ${noSelecionado.nota}` : ""}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Clique numa peça do 3D (ou escolha na lista &ldquo;Peças no modelo&rdquo;) para ver para
            que ela serve, o preço, o selo de confiança e onde comprar.
          </p>
        )}
      </aside>

      <details className="group rounded-lg border p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Peças no modelo</summary>
        <ul className="mt-2 grid gap-0.5 sm:grid-cols-2">
          {pecasNaCena.map((p) => (
            <li key={p.componente}>
              <button
                type="button"
                onClick={() => {
                  setNo(p.no);
                  ws.selecionar(p.componente);
                }}
                aria-pressed={ws.selecionado === p.componente}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-accent aria-pressed:bg-accent aria-pressed:font-medium"
              >
                <Eye aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                {props.partes[p.componente]?.nome ??
                  experimentPart(props, p.componente)?.nome ??
                  p.rotulo}
              </button>
            </li>
          ))}
        </ul>
      </details>

      <details className="rounded-lg border p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Legenda</summary>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {Object.values(WIRE_STYLE).map((w) => (
            <li key={w.rotulo} className="flex items-center gap-2">
              <span aria-hidden="true" className="h-1 w-6 rounded" style={{ background: w.cor }} />
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
            Peças destacadas
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Número e sentido dos motores conforme o {props.firmware}
          {scene.fontes[0] ? ` (${scene.fontes[0].titulo})` : ""}. Medidas em milímetros.
        </p>
      </details>

      <details className="rounded-lg border p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Experimentar (só o desenho)</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1" htmlFor={`${ids}-helice`}>
            <span className="font-medium">Diâmetro da hélice</span>
            <select
              id={`${ids}-helice`}
              value={heliceSim}
              onChange={(e) => setHeliceSim(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5"
            >
              <option value="">Do projeto{helicePol ? ` (${fmt(helicePol, 2)}")` : ""}</option>
              {PROP_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}&quot;
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1" htmlFor={`${ids}-frame`}>
            <span className="font-medium">Frame do catálogo</span>
            <select
              id={`${ids}-frame`}
              value={frameSim}
              onChange={(e) => setFrameSim(e.target.value)}
              className="w-full rounded-md border bg-background px-2 py-1.5"
            >
              <option value="">Do projeto</option>
              {props.frames.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.marca} {f.modelo}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>

      {scene.avisos.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {scene.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </section>
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
  return (
    <dl className="mt-2 space-y-2 text-sm">
      <div>
        <dt className="sr-only">Para que serve</dt>
        <dd>
          <Glossed text={parte.descricao_leiga} />
        </dd>
      </div>
      <div className="flex items-center gap-2">
        <dt className="font-medium">Selo:</dt>
        <dd>
          <Seal status={parte.selo} />
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
              ? `${priceWithDate(parte.preco)} ⚠️ estimativa`
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
function experimentBuild(
  original: Build,
  frames: Component[],
  heliceSim: string,
  frameSim: string,
): Build {
  const frame = frameSim ? frames.find((c) => c.id === frameSim) : undefined;
  const diametro = heliceSim ? Number(heliceSim) : undefined;
  if (!frame && !diametro) return original;
  return {
    ...original,
    itens: original.itens.map((item) => {
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
function experimentPart(props: ProjectViewerProps, id: string): ScenePartInfo | undefined {
  const frame = props.frames.find((c) => c.id === id);
  const original = props.build.itens.find((i) => `${i.componente.id}-simulada` === id)?.componente;
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
