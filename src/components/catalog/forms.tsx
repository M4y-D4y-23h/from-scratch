"use client";

import { CheckCircle2, Loader2, RotateCcw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SOURCE_KINDS } from "@/domain/core/source";
import {
  type CatalogActionResult,
  removeBrlPriceAction,
  saveCatalogJsonAction,
  saveImportParamsAction,
  saveImportParamsJsonAction,
  savePriceAction,
  unverifyCatalogItemAction,
  verifyCatalogItemAction,
} from "@/server/actions/catalog";

/*
 * Formulários da página /catalogo (SPEC B.6). Cada um chama uma ação do servidor, que valida o
 * catálogo inteiro antes de gravar no arquivo JSON e devolve os problemas, se houver. `versao`
 * evita salvar por cima de uma edição feita fora da página.
 */

type State = CatalogActionResult | undefined;

/**
 * Envio de formulário que NÃO apaga o que foi digitado (o `action` do React 19 limpa os campos ao
 * terminar, o que faria a pessoa perder o texto quando há um erro para corrigir).
 */
function useSubmit(fn: (fd: FormData) => Promise<CatalogActionResult>) {
  const [state, setState] = useState<State>();
  const [pending, startTransition] = useTransition();
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await fn(fd);
      setState(r);
    });
  };
  return [state, onSubmit, pending] as const;
}

const SOURCE_LABEL: Record<(typeof SOURCE_KINDS)[number], string> = {
  datasheet: "Datasheet (ficha técnica)",
  pagina_fabricante: "Página do fabricante",
  documentacao_oficial: "Documentação oficial",
  norma: "Norma ou lei",
  loja: "Loja",
  comunidade: "Comunidade (fórum, teste independente)",
};

/** Data de hoje no formato AAAA-MM-DD (do computador de quem usa). */
function hoje(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ActionMessage({ state }: { state: State }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p
        role="status"
        className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-50"
      >
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {state.mensagem}
      </p>
    );
  }
  return (
    <div
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
    >
      <p className="font-medium">{state.erro}</p>
      {state.problemas && state.problemas.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {state.problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? (
        <Loader2 aria-hidden="true" className="animate-spin" />
      ) : (
        <Save aria-hidden="true" />
      )}
      {children}
    </Button>
  );
}

const text = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

/** Conferir numa fonte e marcar como ✅ verificado. */
export function VerifyForm({
  kind,
  id,
  versao,
  verificado,
}: {
  kind: string;
  id: string;
  versao: string;
  verificado: boolean;
}) {
  const [state, onSubmit, pending] = useSubmit(async (fd) => {
    if (fd.get("conferi") !== "on") {
      return { ok: false, erro: "Marque que conferiu os dados na fonte." };
    }
    return verifyCatalogItemAction(kind, id, text(fd, "versao"), {
      titulo: text(fd, "titulo"),
      tipo: text(fd, "tipo"),
      url: text(fd, "url"),
      acessado_em: text(fd, "acessado_em"),
    });
  });
  const [voltando, setVoltando] = useState<State>();
  const [pendenteVolta, setPendenteVolta] = useState(false);
  return (
    <div className="space-y-3">
      {verificado && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
          <ShieldCheck aria-hidden="true" className="size-4" />
          Este item está marcado como verificado.
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={pendenteVolta}
            onClick={async () => {
              setPendenteVolta(true);
              setVoltando(await unverifyCatalogItemAction(kind, id, versao));
              setPendenteVolta(false);
            }}
          >
            <RotateCcw aria-hidden="true" /> Voltar para não verificado
          </Button>
        </div>
      )}
      <ActionMessage state={voltando} />
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="versao" value={versao} />
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="verif-titulo">Fonte que você conferiu</Label>
          <Input
            id="verif-titulo"
            name="titulo"
            required
            minLength={3}
            placeholder="Ex.: Holybro: página oficial do Pixhawk 6C"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="verif-url">Link (https://)</Label>
          <Input id="verif-url" name="url" type="url" required placeholder="https://" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="verif-tipo">Tipo de fonte</Label>
          <select
            id="verif-tipo"
            name="tipo"
            defaultValue="pagina_fabricante"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {SOURCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {SOURCE_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="verif-data">Conferido em</Label>
          <Input id="verif-data" name="acessado_em" type="date" required defaultValue={hoje()} />
        </div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="conferi" className="mt-0.5 size-4 accent-primary" />
          Conferi nesta fonte as especificações usadas pelo motor de cálculo (massa, medidas,
          corrente, tensão, furação...).
        </label>
        <div className="sm:col-span-2">
          <Submit pending={pending}>Marcar como verificado</Submit>
        </div>
      </form>
      <ActionMessage state={state} />
    </div>
  );
}

/** Preço em R$ (loja brasileira) ou US$ (loja internacional), sempre com data. */
export function PriceForm({
  kind,
  id,
  versao,
  permiteUsd,
  temBrl,
}: {
  kind: string;
  id: string;
  versao: string;
  permiteUsd: boolean;
  temBrl: boolean;
}) {
  const [moeda, setMoeda] = useState<"brl" | "usd">("brl");
  const [state, onSubmit, pending] = useSubmit((fd) =>
    savePriceAction(kind, id, text(fd, "versao"), {
      moeda,
      min: text(fd, "min"),
      max: text(fd, "max"),
      data: text(fd, "data"),
      status: text(fd, "status") || "estimativa",
      loja: text(fd, "loja"),
      fonte_titulo: text(fd, "fonte_titulo"),
      fonte_url: text(fd, "fonte_url"),
      observacao: text(fd, "observacao"),
    }),
  );
  const [removido, setRemovido] = useState<State>();
  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="versao" value={versao} />
        {permiteUsd && (
          <fieldset className="flex flex-wrap gap-4 text-sm sm:col-span-2">
            <legend className="sr-only">Moeda</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="moeda"
                checked={moeda === "brl"}
                onChange={() => setMoeda("brl")}
                className="accent-primary"
              />
              R$ em loja brasileira
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="moeda"
                checked={moeda === "usd"}
                onChange={() => setMoeda("usd")}
                className="accent-primary"
              />
              US$ em loja internacional
            </label>
          </fieldset>
        )}
        <div className="space-y-1">
          <Label htmlFor="preco-min">
            Mínimo ({moeda === "brl" ? "R$" : "US$"}, por item vendido)
          </Label>
          <Input id="preco-min" name="min" type="number" step="0.01" min="0" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="preco-max">Máximo</Label>
          <Input id="preco-max" name="max" type="number" step="0.01" min="0" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="preco-data">Data do preço</Label>
          <Input id="preco-data" name="data" type="date" required defaultValue={hoje()} />
        </div>
        {moeda === "brl" ? (
          <div className="space-y-1">
            <Label htmlFor="preco-status">Selo do preço</Label>
            <select
              id="preco-status"
              name="status"
              defaultValue="estimativa"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="estimativa">⚠️ Estimativa</option>
              <option value="verificado">✅ Verificado (precisa do link)</option>
            </select>
          </div>
        ) : (
          <div className="space-y-1">
            <Label htmlFor="preco-loja">Loja</Label>
            <Input
              id="preco-loja"
              name="loja"
              required
              placeholder="Ex.: Loja oficial da Holybro"
            />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="preco-fonte-titulo">Página (título)</Label>
          <Input id="preco-fonte-titulo" name="fonte_titulo" placeholder="Ex.: anúncio na loja X" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="preco-fonte-url">
            Link da página{moeda === "usd" ? "" : " (opcional)"}
          </Label>
          <Input
            id="preco-fonte-url"
            name="fonte_url"
            type="url"
            required={moeda === "usd"}
            placeholder="https://"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="preco-obs">Observação (opcional)</Label>
          <Input id="preco-obs" name="observacao" placeholder="Ex.: preço com frete grátis" />
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Submit pending={pending}>Salvar preço</Submit>
          {temBrl && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={async () => setRemovido(await removeBrlPriceAction(kind, id, versao))}
            >
              <Trash2 aria-hidden="true" /> Tirar o preço em R$
            </Button>
          )}
        </div>
      </form>
      <ActionMessage state={state ?? removido} />
    </div>
  );
}

/** O item inteiro em JSON, validado pelo schema e pelo catálogo antes de gravar. */
export function JsonEditorForm(props: {
  kind: string;
  id: string;
  versao: string;
  json: string;
  importacao?: boolean;
}) {
  // Uma versão nova do item (depois de salvar) recomeça o editor com o JSON gravado.
  return <JsonEditor key={props.versao} {...props} />;
}

function JsonEditor({
  kind,
  id,
  versao,
  json,
  importacao = false,
}: {
  kind: string;
  id: string;
  versao: string;
  json: string;
  importacao?: boolean;
}) {
  const [texto, setTexto] = useState(json);
  const [state, onSubmit, pending] = useSubmit((fd) => {
    const v = text(fd, "versao");
    return importacao
      ? saveImportParamsJsonAction(v, texto)
      : saveCatalogJsonAction(kind, id, v, texto);
  });
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="versao" value={versao} />
      <Label htmlFor={`json-${id}`} className="sr-only">
        JSON do item
      </Label>
      <Textarea
        id={`json-${id}`}
        name="json"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        spellCheck={false}
        rows={18}
        className="min-h-96 font-mono text-xs"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Submit pending={pending}>Validar e salvar</Submit>
        <p className="text-xs text-muted-foreground">
          Nada é gravado se o catálogo ficar inválido. Depois, confira a mudança com git diff.
        </p>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

/** Câmbio, ICMS e data de conferência dos parâmetros de importação. */
export function ImportParamsForm({
  versao,
  atual,
}: {
  versao: string;
  atual: { usd_brl: number; data_cambio: string; icms: [number, number]; verificado_em: string };
}) {
  const [state, onSubmit, pending] = useSubmit((fd) =>
    saveImportParamsAction(text(fd, "versao"), {
      usd_brl: text(fd, "usd_brl"),
      data_cambio: text(fd, "data_cambio"),
      fonte_url: text(fd, "fonte_url"),
      icms_min: text(fd, "icms_min"),
      icms_max: text(fd, "icms_max"),
      verificado_em: text(fd, "verificado_em"),
    }),
  );
  return (
    <form onSubmit={onSubmit} key={versao} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="versao" value={versao} />
      <div className="space-y-1">
        <Label htmlFor="imp-cambio">Câmbio (R$ por US$)</Label>
        <Input
          id="imp-cambio"
          name="usd_brl"
          type="number"
          step="0.0001"
          min="0"
          required
          defaultValue={atual.usd_brl}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="imp-data">Data da cotação</Label>
        <Input
          id="imp-data"
          name="data_cambio"
          type="date"
          required
          defaultValue={atual.data_cambio}
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="imp-fonte">Link da cotação (PTAX do Banco Central), se mudou</Label>
        <Input id="imp-fonte" name="fonte_url" type="url" placeholder="https://" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="imp-icms-min">ICMS menor (%)</Label>
        <Input
          id="imp-icms-min"
          name="icms_min"
          type="number"
          step="0.1"
          min="0"
          max="100"
          required
          defaultValue={atual.icms[0]}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="imp-icms-max">ICMS maior (%)</Label>
        <Input
          id="imp-icms-max"
          name="icms_max"
          type="number"
          step="0.1"
          min="0"
          max="100"
          required
          defaultValue={atual.icms[1]}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="imp-verificado">Regras conferidas em</Label>
        <Input
          id="imp-verificado"
          name="verificado_em"
          type="date"
          required
          defaultValue={atual.verificado_em}
        />
      </div>
      <div className="flex items-end sm:col-span-2">
        <Submit pending={pending}>Salvar parâmetros</Submit>
      </div>
      <div className="sm:col-span-2">
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
