"use client";

import { Check, CircleHelp, ExternalLink, TriangleAlert, X } from "lucide-react";

import { fmt, fmtMinutes } from "@/components/format";
import { Glossed } from "@/components/glossary/glossary";
import { LazyDetails } from "@/components/lazy-details";
import { Seal } from "@/components/seal";
import { DEFAULT_DRONE_CONFIG } from "@/domain/categories/drone/config";
import type { RuleResult } from "@/domain/core/validation";
import type { ProjectViewData } from "@/server/project-view/view";

import { HighlightButton } from "../workspace-buttons";

/*
 * Aba "Cálculos" (SPEC B.7 e B.12): os números do motor de cálculo (peso, empuxo, TWR, pairar,
 * correntes, autonomia, alimentação) e o relatório de validação, regra por regra, com a explicação
 * leiga, a técnica, os valores usados e a fonte.
 */

const TWR = DEFAULT_DRONE_CONFIG.twr;

function Metric({
  titulo,
  valor,
  selo,
  children,
}: {
  titulo: string;
  valor: string;
  selo?: RuleResult["selo"];
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3 text-sm">
      <dt className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          <Glossed text={titulo} />
        </span>
        {selo && <Seal status={selo} compacto />}
      </dt>
      <dd className="text-lg font-semibold">{valor}</dd>
      {children && <dd className="mt-1 text-xs text-muted-foreground">{children}</dd>}
    </div>
  );
}

/** Régua do TWR com as faixas da SPEC B.7 e o ponto do projeto. */
function TwrScale({ twr, alvo }: { twr?: number; alvo: readonly [number, number] }) {
  const max = Math.max(10, Math.ceil((twr ?? 0) + 1));
  const pos = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const faixas = [
    {
      de: 0,
      ate: TWR.minimo_seguro,
      cor: "bg-red-300 dark:bg-red-900",
      rotulo: "não voa com segurança",
    },
    {
      de: TWR.filmagem[0],
      ate: TWR.filmagem[1],
      cor: "bg-emerald-300 dark:bg-emerald-800",
      rotulo: "filmagem estável",
    },
    {
      de: TWR.uso_geral[0],
      ate: TWR.uso_geral[1],
      cor: "bg-sky-300 dark:bg-sky-800",
      rotulo: "uso geral",
    },
    {
      de: TWR.freestyle_acima_de,
      ate: max,
      cor: "bg-violet-300 dark:bg-violet-800",
      rotulo: "freestyle e corrida",
    },
  ];
  return (
    <figure className="space-y-1">
      <div className="relative h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {faixas.map((f) => (
          <span
            key={f.rotulo}
            className={`absolute inset-y-0 ${f.cor}`}
            style={{ left: pos(f.de), width: `calc(${pos(f.ate)} - ${pos(f.de)})` }}
          />
        ))}
        {twr !== undefined && (
          <span
            className="absolute inset-y-[-2px] w-1 rounded bg-foreground"
            style={{ left: `calc(${pos(twr)} - 2px)` }}
          />
        )}
      </div>
      <figcaption className="text-xs text-muted-foreground">
        Faixas (SPEC B.7): abaixo de {fmt(TWR.minimo_seguro)} não voa com segurança;{" "}
        {fmt(TWR.filmagem[0])} a {fmt(TWR.filmagem[1])} filmagem estável; {fmt(TWR.uso_geral[0])} a{" "}
        {fmt(TWR.uso_geral[1])} uso geral; acima de {fmt(TWR.freestyle_acima_de)} freestyle e
        corrida. Alvo deste arquétipo: {fmt(alvo[0])} a {fmt(alvo[1])}.
      </figcaption>
    </figure>
  );
}

const STATUS = {
  passou: { Icon: Check, rotulo: "passou", estilo: "text-emerald-700 dark:text-emerald-400" },
  falhou: { Icon: X, rotulo: "falhou", estilo: "text-red-700 dark:text-red-400" },
  sem_dado: { Icon: CircleHelp, rotulo: "sem dado", estilo: "text-slate-600 dark:text-slate-300" },
} as const;

function RuleCard({ regra, nomes }: { regra: RuleResult; nomes: Map<string, string> }) {
  const st =
    regra.severidade === "alerta" && regra.status === "falhou"
      ? { Icon: TriangleAlert, rotulo: "aviso", estilo: "text-amber-700 dark:text-amber-400" }
      : STATUS[regra.status];
  const pecas = (regra.componentes ?? []).filter((id) => nomes.has(id));
  return (
    <article className="rounded-lg border p-3 text-sm">
      <header className="flex items-start justify-between gap-2">
        <h5 className="flex items-start gap-1.5 font-medium">
          <st.Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${st.estilo}`} />
          <span>
            {regra.titulo}
            <span className="sr-only">: {st.rotulo}</span>
          </span>
        </h5>
        <span className="flex shrink-0 items-center gap-1">
          <span className="rounded-full border px-1.5 text-[0.7rem] text-muted-foreground">
            {regra.severidade}
          </span>
          <Seal status={regra.selo} compacto />
        </span>
      </header>
      <p className="mt-1 text-muted-foreground">
        <Glossed text={regra.explicacao_leiga} />
      </p>
      {regra.sugestao && (
        <p className="mt-2 rounded-md bg-muted p-2">
          <span className="font-medium">O que fazer:</span> <Glossed text={regra.sugestao} />
        </p>
      )}
      <LazyDetails
        className="mt-2"
        summaryClassName="cursor-pointer text-xs font-medium"
        summary="Detalhes técnicos"
      >
        <div className="mt-2 space-y-2 text-xs">
          <p>{regra.explicacao_tecnica}</p>
          {regra.valores && Object.keys(regra.valores).length > 0 && (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {Object.entries(regra.valores).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                  <dd className="font-mono">{typeof v === "number" ? fmt(v, 2) : String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          {pecas.length > 0 && <p>Peças: {pecas.map((id) => nomes.get(id)).join(", ")}.</p>}
          {regra.fontes && regra.fontes.length > 0 && (
            <ul className="space-y-0.5">
              {regra.fontes.map((f) => (
                <li key={`${f.titulo}-${f.url ?? ""}`}>
                  Fonte:{" "}
                  {f.url ? (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 underline underline-offset-2"
                    >
                      {f.titulo}
                      <ExternalLink aria-hidden="true" className="size-3" />
                    </a>
                  ) : (
                    f.titulo
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </LazyDetails>
      {pecas.length > 0 && (
        <div className="mt-1">
          <HighlightButton rotulo={`Regra: ${regra.titulo}`} componentes={pecas}>
            Ver as peças no 3D
          </HighlightButton>
        </div>
      )}
    </article>
  );
}

export function CalculationsTab({ data }: { data: ProjectViewData }) {
  const { auw, propulsion: prop, flight, power } = data.relatorio.metricas;
  const v = data.relatorio.validacao;
  const nomes = new Map(
    data.build.itens.map((i) => [i.componente.id, `${i.componente.marca} ${i.componente.modelo}`]),
  );
  const grupos: Array<{ titulo: string; regras: RuleResult[]; aberto: boolean }> = [
    {
      titulo: "Bloqueantes que falharam",
      regras: v.resultados.filter((r) => r.severidade === "bloqueante" && r.status === "falhou"),
      aberto: true,
    },
    {
      titulo: "Avisos",
      regras: v.resultados.filter((r) => r.severidade === "alerta" && r.status === "falhou"),
      aberto: true,
    },
    {
      titulo: "Sem dado",
      regras: v.resultados.filter((r) => r.status === "sem_dado"),
      aberto: true,
    },
    {
      titulo: "Passaram",
      regras: v.resultados.filter((r) => r.status === "passou"),
      aberto: false,
    },
  ];
  const cmp = data.comparacao_tamanho;

  return (
    <>
      <section aria-labelledby="titulo-numeros" className="space-y-3">
        <h3 id="titulo-numeros" className="text-lg font-semibold">
          Os números do projeto
        </h3>
        <dl className="grid grid-cols-2 gap-2">
          <Metric
            titulo="Peso total (AUW)"
            valor={auw.massa_total_g !== undefined ? `${fmt(auw.massa_total_g, 0)} g` : "sem dado"}
            selo={auw.selo}
          >
            Peças {fmt(auw.massa_pecas_g, 0)} g + {fmt(auw.margem_g, 0)} g de margem para fios e
            parafusos.
            {auw.estimadas.length > 0 &&
              ` Massa estimada: ${auw.estimadas.map((id) => nomes.get(id) ?? id).join(", ")}.`}
            {auw.faltando.length > 0 && ` Sem massa: ${auw.faltando.join(", ")}.`}
          </Metric>
          <Metric
            titulo="Empuxo máximo"
            valor={
              prop.empuxo_total_g !== undefined ? `${fmt(prop.empuxo_total_g, 0)} g` : "sem dado"
            }
            selo={prop.selo}
          >
            {prop.empuxo_max_por_motor_g !== undefined
              ? `${prop.motores} motores × ${fmt(prop.empuxo_max_por_motor_g, 0)} g (tabela do fabricante).`
              : prop.faltando.join("; ")}
          </Metric>
          <Metric
            titulo="TWR (empuxo ÷ peso)"
            valor={prop.twr !== undefined ? fmt(prop.twr, 2) : "sem dado"}
            selo={prop.selo}
          >
            {prop.twr !== undefined && prop.twr < TWR.minimo_seguro
              ? "Abaixo do mínimo: não voa com segurança."
              : "Quanto sobra de força para subir, frear e corrigir o vento."}
          </Metric>
          <Metric
            titulo="Acelerador para pairar (hover)"
            valor={
              prop.hover
                ? `${prop.hover.precisao === "abaixo_da_tabela" ? "até " : ""}${fmt(prop.hover.throttle_pct, 0)}%`
                : "sem dado"
            }
            selo={prop.selo}
          >
            O ideal é perto de {DEFAULT_DRONE_CONFIG.hover.ideal_pct}%, para sobrar força.
            {prop.hover?.precisao === "abaixo_da_tabela" &&
              " A tabela do fabricante começa acima do ponto de pairar: o valor é um limite superior."}
          </Metric>
          <Metric
            titulo="Corrente máxima"
            valor={
              prop.corrente_max_total_a !== undefined
                ? `${fmt(prop.corrente_max_total_a, 0)} A`
                : "sem dado"
            }
            selo={prop.selo}
          >
            {prop.corrente_max_por_motor_a !== undefined &&
              `${fmt(prop.corrente_max_por_motor_a, 1)} A por motor no máximo. `}
            {prop.corrente_hover_motores_a !== undefined &&
              `Pairando: ~${fmt(prop.corrente_hover_motores_a, 1)} A nos motores.`}
          </Metric>
          <Metric
            titulo="Tempo de voo"
            valor={fmtMinutes(flight.min_minutos, flight.max_minutos)}
            selo={flight.selo}
          >
            {flight.premissas.join("; ")}.
          </Metric>
        </dl>
        <TwrScale twr={prop.twr} alvo={data.arquetipo.faixas.twr_alvo} />
      </section>

      {power.atribuicoes.length > 0 && (
        <section aria-labelledby="titulo-energia" className="space-y-2">
          <h3 id="titulo-energia" className="text-lg font-semibold">
            Alimentação dos eletrônicos
          </h3>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">De onde cada eletrônico tira energia</caption>
              <thead className="bg-muted/60 text-xs">
                <tr>
                  <th scope="col" className="p-2">
                    Peça
                  </th>
                  <th scope="col" className="p-2">
                    Energia de
                  </th>
                  <th scope="col" className="p-2">
                    Corrente
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {power.atribuicoes.map((a) => (
                  <tr key={a.componente_id}>
                    <th scope="row" className="p-2 font-normal">
                      {nomes.get(a.componente_id) ?? a.componente_id}
                    </th>
                    <td className="p-2 text-xs">
                      {a.fonte === null
                        ? "sem fonte compatível"
                        : a.fonte.tipo === "bec"
                          ? `BEC ${a.fonte.indice + 1} (${fmt(a.fonte.tensao_v)} V)`
                          : `direto da bateria (${fmt(a.fonte.tensao_v)} V)`}
                    </td>
                    <td className="p-2 text-xs">
                      {a.corrente_a !== undefined
                        ? `${fmt(a.corrente_a * 1000, 0)} mA`
                        : "sem dado"}
                      {a.corrente_presumida ? " (presumida)" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {power.carga_por_bec_a.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Carga por BEC:{" "}
              {power.carga_por_bec_a.map((c, i) => `BEC ${i + 1}: ${fmt(c, 2)} A`).join("; ")}.
              {power.presumidos.length > 0 &&
                " Corrente presumida = o fabricante não publica; usamos um valor conservador."}
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="titulo-regras" className="space-y-3">
        <div>
          <h3 id="titulo-regras" className="text-lg font-semibold">
            Regras de compatibilidade ({v.resultados.length})
          </h3>
          <p className="text-sm text-muted-foreground">
            {v.contagem.passou} passaram · {v.contagem.falhou} falharam · {v.contagem.sem_dado} sem
            dado. &ldquo;Bloqueante&rdquo; = não monte assim; &ldquo;alerta&rdquo; = dá para montar,
            mas leia o aviso. Falta de dado nunca vira &ldquo;passou&rdquo;.
          </p>
        </div>
        {grupos.map((g) =>
          g.regras.length === 0 ? null : (
            <LazyDetails
              key={g.titulo}
              open={g.aberto}
              className="space-y-2"
              summaryClassName="cursor-pointer font-semibold"
              summary={`${g.titulo} (${g.regras.length})`}
            >
              <ul className="mt-2 space-y-2">
                {g.regras.map((r) => (
                  <li key={r.regra_id}>
                    <RuleCard regra={r} nomes={nomes} />
                  </li>
                ))}
              </ul>
            </LazyDetails>
          ),
        )}
      </section>

      {cmp && (
        <section aria-labelledby="titulo-tamanho" className="space-y-2">
          <h3 id="titulo-tamanho" className="text-lg font-semibold">
            Por que a classe 450 mm? (comparação com o 5&quot;)
          </h3>
          <p className="text-sm text-muted-foreground">
            Critério da SPEC: o mais fácil e seguro para um leigo, dentro do orçamento. Só concorre
            quem atende aos requisitos (GPS com bússola, ArduPilot, retorno automático).
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Comparação de classes de tamanho</caption>
              <thead className="bg-muted/60 text-xs">
                <tr>
                  <th scope="col" className="p-2">
                    Critério (peso)
                  </th>
                  {cmp.candidatos.map((c) => (
                    <th key={c.rotulo} scope="col" className="p-2">
                      {c.rotulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y text-xs">
                {cmp.criterios.map((k) => (
                  <tr key={k.id}>
                    <th scope="row" className="p-2 font-normal">
                      {k.titulo} ({fmt(k.peso, 2)})
                    </th>
                    {k.valores.map((val) => (
                      <td key={val.rotulo} className="p-2">
                        {val.valor === undefined ? "sem dado" : `${fmt(val.valor, 1)} ${k.unidade}`}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-muted/40 font-medium">
                  <th scope="row" className="p-2">
                    Nota (0 a 1)
                  </th>
                  {cmp.candidatos.map((c) => (
                    <td key={c.rotulo} className="p-2">
                      {fmt(c.nota, 2)}
                      {!c.atende && " · não atende"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm">
            <Glossed text={cmp.explicacao} />
          </p>
        </section>
      )}
    </>
  );
}
