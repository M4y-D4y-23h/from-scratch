"use client";

import {
  Bot,
  Info,
  ListChecks,
  Loader2,
  RotateCcw,
  ShieldX,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { type RefObject, useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Glossed } from "@/components/glossary/glossary";
import { LazyDetails } from "@/components/lazy-details";
import { SafetyAlertCard } from "@/components/safety-alerts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type Answers, type Question, QUESTIONS } from "@/domain/categories/drone/pipeline/choose";
import type { Explanation } from "@/domain/categories/drone/pipeline/explain";
import type { OptionCard } from "@/domain/categories/drone/pipeline/plan";
import type { SafetyAlert } from "@/domain/core/safety";
import {
  analyzeRequestAction,
  createProjectFromRequestAction,
  explainChoiceAction,
} from "@/server/actions/pedido";
import type { LlmMode } from "@/server/llm/client";
import type { PipelineResult } from "@/server/pipeline/run";

import { AUTO_ENVIAR_KEY, PEDIDO_EXEMPLOS } from "./examples";
import { PedidoOptionCard } from "./option-card";

/*
 * Pedido em linguagem natural → perguntas clicáveis → 2–3 opções → projeto (SPEC B.10). O
 * navegador só manda o texto, as respostas e a opção escolhida; o servidor refaz tudo com o
 * motor de cálculo. A IA lê o pedido e explica a escolha; os números vêm do catálogo.
 */

const MAX_PEDIDO = 1000;

/** Alertas que nasceram do que a pessoa pediu: aparecem abertos, antes dos demais. */
const DO_PEDIDO = new Set([
  "alcance-pedido",
  "pessoas-no-pedido",
  "uso-nao-recreativo",
  "celular-experimental",
  "iphone",
]);

type ExplanationState = { pedidoId: number; valor?: Explanation; erro?: string };

export function PedidoFlow({ inicial, modo }: { inicial: string; modo: LlmMode }) {
  const [texto, setTexto] = useState(inicial);
  const [enviado, setEnviado] = useState<string>();
  const [resultado, setResultado] = useState<PipelineResult>();
  /** Qual análise produziu o resultado mostrado (a explicação só vale para ela). */
  const [resultadoId, setResultadoId] = useState(0);
  const [erro, setErro] = useState<string>();
  const [explicacao, setExplicacao] = useState<ExplanationState>();
  const [analisando, startAnalise] = useTransition();
  const [criando, startCriar] = useTransition();
  const [criandoChave, setCriandoChave] = useState<string>();
  const ultimo = useRef(0);
  const titulo = useRef<HTMLHeadingElement>(null);

  const carregarExplicacao = useCallback(async (pedido: string, respostas: Answers, id: number) => {
    setExplicacao({ pedidoId: id });
    const r = await explainChoiceAction(pedido, respostas);
    if (id !== ultimo.current) return;
    setExplicacao(r.ok ? { pedidoId: id, valor: r.explicacao } : { pedidoId: id, erro: r.erro });
  }, []);

  const analisar = useCallback(
    (pedido: string, respostas: Answers, novo = true) => {
      const id = ++ultimo.current;
      setErro(undefined);
      startAnalise(async () => {
        const r = await analyzeRequestAction(pedido, respostas, novo);
        if (id !== ultimo.current) return;
        if (!r.ok) {
          setErro(r.erro);
          return;
        }
        setEnviado(pedido);
        setResultado(r.resultado);
        setResultadoId(id);
        setExplicacao(undefined);
        if (r.resultado.tipo === "opcoes")
          void carregarExplicacao(pedido, r.resultado.respostas, id);
      });
    },
    [carregarExplicacao],
  );

  // Pedido digitado na página inicial: envia ao abrir (o sessionStorage garante que veio de lá).
  useEffect(() => {
    let pendente: string | null;
    try {
      pendente = sessionStorage.getItem(AUTO_ENVIAR_KEY);
    } catch {
      return; // Sem sessionStorage: a pessoa clica em "Montar meu projeto".
    }
    if (!pendente) return;
    const pedido = pendente;
    if (pedido !== inicial.trim()) {
      sessionStorage.removeItem(AUTO_ENVIAR_KEY);
      return;
    }
    // Fora do corpo do efeito (e cancelável: no modo de desenvolvimento o efeito roda duas vezes).
    const timer = window.setTimeout(() => {
      sessionStorage.removeItem(AUTO_ENVIAR_KEY);
      analisar(pedido, {});
    }, 0);
    return () => window.clearTimeout(timer);
  }, [analisar, inicial]);

  // Resultado novo: o foco vai para o título dele (teclado e leitor de tela acompanham).
  useEffect(() => {
    if (resultado) titulo.current?.focus();
  }, [resultado]);

  function enviar() {
    const limpo = texto.trim();
    if (limpo.length < 3) {
      setErro("Escreva um pouco mais sobre o drone que você quer.");
      return;
    }
    analisar(limpo, {});
  }

  function escolher(card: OptionCard) {
    if (!resultado || !enviado || resultado.tipo === "recusa" || resultado.tipo === "perguntas")
      return;
    const respostas = resultado.respostas;
    setCriandoChave(`${card.arquetipo_id}:${card.faixa}`);
    setErro(undefined);
    startCriar(async () => {
      const r = await createProjectFromRequestAction(enviado, respostas, {
        arquetipo_id: card.arquetipo_id,
        faixa: card.faixa,
      });
      // Deu certo: o servidor já levou para a página do projeto. Só volta aqui se deu erro.
      if (r && !r.ok) {
        setErro(r.erro);
        setCriandoChave(undefined);
      }
    });
  }

  const ocupado = analisando || criando;

  return (
    <div className="space-y-8">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        <label htmlFor="pedido" className="block text-sm font-medium">
          Descreva o drone que você quer: para que vai usar, onde vai voar, quanto quer gastar
        </label>
        <Textarea
          id="pedido"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={MAX_PEDIDO}
          rows={3}
          placeholder="Ex.: drone para filmar viagens, até R$ 3.000, que volte sozinho se perder o sinal"
          aria-describedby="pedido-ajuda"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar();
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p id="pedido-ajuda" className="text-xs text-muted-foreground">
            {texto.length}/{MAX_PEDIDO} letras · Ctrl+Enter também envia
          </p>
          <Button type="submit" disabled={ocupado}>
            {analisando ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Lendo o pedido...
              </>
            ) : (
              <>
                <Sparkles aria-hidden="true" className="size-4" /> Montar meu projeto
              </>
            )}
          </Button>
        </div>
        {!resultado && (
          <div className="text-sm">
            <p className="text-muted-foreground">Exemplos (clique para usar):</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {PEDIDO_EXEMPLOS.map((e) => (
                <li key={e}>
                  <button
                    type="button"
                    onClick={() => setTexto(e)}
                    className="rounded-full border px-3 py-1 text-xs hover:bg-accent"
                  >
                    {e}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ModeNotice modo={modo} />
      </form>

      <section
        aria-label="Resultado do pedido"
        aria-live="polite"
        aria-busy={analisando}
        className="space-y-6"
      >
        {erro && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
          >
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {erro}
          </p>
        )}
        {analisando && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            {modo === "ia"
              ? "A IA está lendo o seu pedido; depois o motor de cálculo monta as opções com peças reais..."
              : "Lendo o seu pedido e montando as opções com peças reais..."}
          </p>
        )}
        {resultado && !analisando && (
          <Result
            resultado={resultado}
            tituloRef={titulo}
            explicacao={explicacao?.pedidoId === resultadoId ? explicacao : undefined}
            ocupado={ocupado}
            criandoChave={criando ? criandoChave : undefined}
            onResponder={(respostas) => enviado && analisar(enviado, respostas, false)}
            onEscolher={escolher}
          />
        )}
      </section>
    </div>
  );
}

function ModeNotice({ modo }: { modo: LlmMode }) {
  return modo === "ia" ? (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <Bot aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>
        A IA (Claude) lê o pedido e explica a escolha; peças, números e regras vêm do catálogo e do
        motor de cálculo. O texto do pedido vai para a API da Anthropic; cada pedido novo é uma
        chamada paga, registrada com o custo no banco local. Responder às perguntas não faz outra.
      </span>
    </p>
  ) : (
    <p className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
      <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <strong className="text-foreground">Modo simples (sem IA).</strong> Não há chave da API no
        arquivo <code>.env.local</code>, então o pedido é lido por palavras-chave: funciona com
        pedidos diretos, como os exemplos. Para a IA ler pedidos livres, coloque a chave em{" "}
        <code>ANTHROPIC_API_KEY</code> (veja o README) e reinicie o app.
      </span>
    </p>
  );
}

function Result({
  resultado,
  tituloRef,
  explicacao,
  ocupado,
  criandoChave,
  onResponder,
  onEscolher,
}: {
  resultado: PipelineResult;
  tituloRef: RefObject<HTMLHeadingElement | null>;
  explicacao?: ExplanationState;
  ocupado: boolean;
  criandoChave?: string;
  onResponder: (respostas: Answers) => void;
  onEscolher: (card: OptionCard) => void;
}) {
  const leitura = (
    <p className="text-xs text-muted-foreground">
      {resultado.modo === "ia"
        ? "Pedido lido pela IA (Claude)."
        : "Pedido lido no modo simples (palavras-chave, sem IA)."}
    </p>
  );
  const avisos = resultado.avisos.length > 0 && (
    <ul className="space-y-2">
      {resultado.avisos.map((a) => (
        <li
          key={a}
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30"
        >
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {a}
        </li>
      ))}
    </ul>
  );

  if (resultado.tipo === "recusa") {
    const { recusa } = resultado;
    return (
      <div className="space-y-4" data-testid="resultado-recusa">
        <div className="space-y-3 rounded-xl border border-red-300 bg-red-50/70 p-5 dark:border-red-900 dark:bg-red-950/30">
          <h2
            ref={tituloRef}
            tabIndex={-1}
            className="flex items-start gap-2 text-xl font-semibold outline-none"
          >
            <ShieldX aria-hidden="true" className="mt-1 size-5 shrink-0" />
            {recusa.titulo}
          </h2>
          <p>{recusa.explicacao}</p>
          {recusa.alternativa && (
            <p>
              <strong>Uma alternativa: </strong>
              {recusa.alternativa}
            </p>
          )}
        </div>
        {leitura}
      </div>
    );
  }

  const respostas = Object.keys(resultado.respostas).length > 0 && (
    <AnswersSummary
      respostas={resultado.respostas}
      onRefazer={() => onResponder({})}
      desabilitado={ocupado}
    />
  );

  if (resultado.tipo === "perguntas") {
    return (
      <div className="space-y-6" data-testid="resultado-perguntas">
        <div className="space-y-1">
          <h2 ref={tituloRef} tabIndex={-1} className="text-xl font-semibold outline-none">
            Antes de montar,{" "}
            {resultado.perguntas.length === 1
              ? "uma pergunta"
              : `${resultado.perguntas.length} perguntas`}
          </h2>
          <p className="text-sm text-muted-foreground">
            Clique numa opção em cada pergunta. Para o resto, assumimos o mais comum (veja abaixo).
          </p>
          {leitura}
        </div>
        {avisos}
        <QuestionsForm
          key={JSON.stringify(resultado.respostas)}
          perguntas={resultado.perguntas}
          respostas={resultado.respostas}
          desabilitado={ocupado}
          onContinuar={onResponder}
        />
        <AlertsBlock alertas={resultado.alertas} />
        <Assumptions suposicoes={resultado.suposicoes} />
      </div>
    );
  }

  if (resultado.tipo === "inviavel") {
    const { inviabilidade } = resultado;
    return (
      <div className="space-y-6" data-testid="resultado-inviavel">
        <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/70 p-5 dark:border-amber-900 dark:bg-amber-950/30">
          <h2
            ref={tituloRef}
            tabIndex={-1}
            className="flex items-start gap-2 text-xl font-semibold outline-none"
          >
            <TriangleAlert aria-hidden="true" className="mt-1 size-5 shrink-0" />
            {inviabilidade.titulo}
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            {inviabilidade.explicacao.map((l) => (
              <li key={l}>
                <Glossed text={l} />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Números do motor de cálculo com o catálogo atual (dados ❓ ainda não conferidos). Mude o
            pedido acima para tentar outra coisa.
          </p>
        </div>
        {leitura}
        {avisos}
        {respostas}
        {inviabilidade.alternativa && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">{inviabilidade.alternativa.titulo}</h3>
            <ul className="grid gap-4 md:grid-cols-3">
              {inviabilidade.alternativa.opcoes.map((o) => (
                <li key={`${o.arquetipo_id}:${o.faixa}`}>
                  <PedidoOptionCard
                    opcao={o}
                    mostrarArquetipo
                    criando={criandoChave === `${o.arquetipo_id}:${o.faixa}`}
                    desabilitado={ocupado}
                    onEscolher={() => onEscolher(o)}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
        <AlertsBlock alertas={resultado.alertas} />
        <Assumptions suposicoes={resultado.suposicoes} />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="resultado-opcoes">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">
          Para o seu pedido, o tipo de drone indicado é:
        </p>
        <h2
          ref={tituloRef}
          tabIndex={-1}
          className="text-2xl font-semibold tracking-tight outline-none"
        >
          {resultado.arquetipo.nome}
        </h2>
        <p className="text-sm text-muted-foreground">{resultado.arquetipo.para_quem}</p>
        {leitura}
      </div>
      {avisos}
      <Why motivos={resultado.motivos} explicacao={explicacao} />
      {respostas}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Escolha uma das {resultado.opcoes.length} opções</h3>
        <p className="text-sm text-muted-foreground">
          Mesmo tipo de drone, peças diferentes. Escolher cria o seu projeto, com 3D, lista de
          compras, custos, dificuldade e o guia, e você ainda pode trocar peças depois.
        </p>
        <ul className="grid gap-4 md:grid-cols-3">
          {resultado.opcoes.map((o) => (
            <li key={`${o.arquetipo_id}:${o.faixa}`}>
              <PedidoOptionCard
                opcao={o}
                criando={criandoChave === `${o.arquetipo_id}:${o.faixa}`}
                desabilitado={ocupado}
                onEscolher={() => onEscolher(o)}
              />
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Números do motor de cálculo com o catálogo atual: os dados das peças ainda não foram
          conferidos (❓) e os preços são estimativas com data.
        </p>
      </div>
      <AlertsBlock alertas={resultado.alertas} />
      <Assumptions suposicoes={resultado.suposicoes} />
    </div>
  );
}

function Why({ motivos, explicacao }: { motivos: string[]; explicacao?: ExplanationState }) {
  const carregando = explicacao !== undefined && !explicacao.valor && !explicacao.erro;
  const paragrafos = explicacao?.valor?.paragrafos ?? motivos;
  const daIa = explicacao?.valor?.origem === "ia";
  return (
    <div className="space-y-2 rounded-xl border bg-muted/30 p-4" data-testid="por-que">
      <h3 className="font-semibold">Por que este drone</h3>
      {paragrafos.map((p) => (
        <p key={p} className="text-sm">
          <Glossed text={p} />
        </p>
      ))}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {carregando ? (
          <>
            <Loader2 aria-hidden="true" className="size-3 animate-spin" /> A IA está escrevendo uma
            explicação com as suas palavras...
          </>
        ) : daIa ? (
          "Explicação escrita pela IA a partir das regras do app (sem números; eles ficam nas opções)."
        ) : (
          "Motivos das regras do app."
        )}
      </p>
    </div>
  );
}

function QuestionsForm({
  perguntas,
  respostas,
  desabilitado,
  onContinuar,
}: {
  perguntas: Question[];
  respostas: Answers;
  desabilitado: boolean;
  onContinuar: (respostas: Answers) => void;
}) {
  const [escolhas, setEscolhas] = useState<Answers>({});
  const faltam = perguntas.filter((p) => escolhas[p.id] === undefined).length;
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (faltam === 0) onContinuar({ ...respostas, ...escolhas });
      }}
    >
      {perguntas.map((p) => (
        <fieldset key={p.id} className="space-y-2">
          <legend className="font-medium">{p.pergunta}</legend>
          {p.ajuda && <p className="text-sm text-muted-foreground">{p.ajuda}</p>}
          <div className="flex flex-wrap gap-2">
            {p.opcoes.map((o) => (
              <label
                key={o.valor}
                className="cursor-pointer rounded-lg border px-3 py-2 text-sm hover:bg-accent has-[input:checked]:border-primary has-[input:checked]:bg-primary/10 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring"
              >
                <input
                  type="radio"
                  name={p.id}
                  value={o.valor}
                  className="sr-only"
                  checked={escolhas[p.id] === o.valor}
                  onChange={() => setEscolhas((atual) => ({ ...atual, [p.id]: o.valor }))}
                />
                <span className="block font-medium">{o.rotulo}</span>
                {o.descricao && (
                  <span className="block text-xs text-muted-foreground">{o.descricao}</span>
                )}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <Button type="submit" disabled={desabilitado || faltam > 0}>
        <ListChecks aria-hidden="true" className="size-4" />
        {faltam > 0
          ? `Responda ${faltam === 1 ? "a pergunta" : `as ${faltam} perguntas`} para continuar`
          : "Ver as opções"}
      </Button>
    </form>
  );
}

function AnswersSummary({
  respostas,
  onRefazer,
  desabilitado,
}: {
  respostas: Answers;
  onRefazer: () => void;
  desabilitado: boolean;
}) {
  const itens = Object.entries(respostas).flatMap(([id, valor]) => {
    const pergunta = QUESTIONS[id as keyof typeof QUESTIONS] as Question | undefined;
    const opcao = pergunta?.opcoes.find((o) => o.valor === valor);
    return pergunta && opcao ? [{ id, pergunta: pergunta.pergunta, rotulo: opcao.rotulo }] : [];
  });
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Suas respostas:</span>
      {itens.map((i) => (
        <span key={i.id} title={i.pergunta} className="rounded-full border px-2.5 py-0.5 text-xs">
          {i.rotulo}
        </span>
      ))}
      <Button variant="ghost" size="sm" onClick={onRefazer} disabled={desabilitado}>
        <RotateCcw aria-hidden="true" className="size-3.5" /> Refazer as perguntas
      </Button>
    </div>
  );
}

function AlertsBlock({ alertas }: { alertas: SafetyAlert[] }) {
  if (alertas.length === 0) return null;
  const doPedido = alertas.filter((a) => DO_PEDIDO.has(a.id));
  const outros = alertas.filter((a) => !DO_PEDIDO.has(a.id));
  return (
    <div className="space-y-3" data-testid="alertas-pedido">
      {doPedido.length > 0 && (
        <>
          <h3 className="text-lg font-semibold">Atenção ao que você pediu</h3>
          <ul className="space-y-2">
            {doPedido.map((a) => (
              <li key={a.id}>
                <SafetyAlertCard alerta={a} comNivel />
              </li>
            ))}
          </ul>
        </>
      )}
      {outros.length > 0 && (
        <LazyDetails
          className="rounded-lg border"
          summaryClassName="cursor-pointer p-3 font-medium"
          summary={`${doPedido.length > 0 ? "Outros riscos e regras" : "Riscos e regras"} deste tipo de drone (${outros.length})`}
        >
          <ul className="space-y-2 px-3 pb-3">
            {outros.map((a) => (
              <li key={a.id}>
                <SafetyAlertCard alerta={a} comNivel />
              </li>
            ))}
          </ul>
        </LazyDetails>
      )}
    </div>
  );
}

function Assumptions({ suposicoes }: { suposicoes: string[] }) {
  if (suposicoes.length === 0) return null;
  return (
    <div className="space-y-2 text-sm">
      <h3 className="font-semibold">O que assumimos (dá para mudar)</h3>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        {suposicoes.map((s) => (
          <li key={s}>
            <Glossed text={s} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Para mudar, escreva o pedido acima com mais detalhes (orçamento, celular, onde vai voar) e
        envie de novo.
      </p>
    </div>
  );
}
