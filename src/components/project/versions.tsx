"use client";

import { History, Loader2, Pencil, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { dataHoraBr } from "@/components/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteProjectAction,
  renameProjectAction,
  restoreVersionAction,
} from "@/server/actions/projects";
import { TIER_LABEL } from "@/domain/categories/drone/build";
import type { ProjectOrigin, ProjectViewData } from "@/server/project-view/view";

import { useWorkspaceActions } from "./workspace";

/*
 * O seu projeto: nome, de onde veio e o histórico de versões (SPEC B.5: toda alteração gera nova
 * versão). Ver uma versão antiga não muda nada; "voltar para esta versão" cria uma versão nova.
 */

type Projeto = Extract<ProjectOrigin, { tipo: "projeto" }>;

export function ProjectVersions({ data, origem }: { data: ProjectViewData; origem: Projeto }) {
  const ws = useWorkspaceActions();
  const [pendente, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [apagar, setApagar] = useState(false);
  const antiga = origem.versao !== origem.versao_atual;

  const rodar = (
    acao: () => Promise<{ ok: boolean; erro?: string; mensagem?: string } | undefined>,
  ) =>
    startTransition(async () => {
      const r = await acao();
      if (r && !r.ok) ws.notificar({ tipo: "erro", texto: r.erro ?? "Não deu certo." });
      else if (r?.mensagem) ws.notificar({ tipo: "ok", texto: r.mensagem });
    });

  return (
    <section aria-labelledby="titulo-projeto" className="space-y-3 rounded-xl border p-4 text-sm">
      {editando ? (
        <form
          action={(form) =>
            rodar(async () => {
              const r = await renameProjectAction(origem.id, form.get("titulo"));
              if (r.ok) setEditando(false);
              return r;
            })
          }
          className="space-y-2"
        >
          <Label htmlFor="titulo-novo">Nome do projeto</Label>
          <Input
            id="titulo-novo"
            name="titulo"
            defaultValue={origem.titulo}
            maxLength={120}
            required
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pendente}>
              Salvar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <h2 id="titulo-projeto" className="text-base font-semibold">
            {origem.titulo}
          </h2>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setEditando(true)}
            aria-label="Mudar o nome do projeto"
          >
            <Pencil />
          </Button>
        </div>
      )}
      <p className="text-muted-foreground">
        Baseado em: {data.arquetipo.nome}
        {origem.faixa_origem ? `, faixa ${TIER_LABEL[origem.faixa_origem].toLowerCase()}` : ""}.
      </p>

      {antiga && (
        <div
          role="status"
          className="rounded-md border border-sky-300 bg-sky-50 p-2 dark:border-sky-800 dark:bg-sky-950/40"
        >
          <p>
            Você está vendo a <strong>versão {origem.versao}</strong>. A atual é a{" "}
            {origem.versao_atual}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="xs"
              disabled={pendente}
              onClick={() => rodar(() => restoreVersionAction(origem.id, origem.versao))}
            >
              <RotateCcw aria-hidden="true" /> Voltar para esta versão
            </Button>
            <Button asChild size="xs" variant="outline">
              <Link href={`/projetos/${origem.id}`}>Ver a atual</Link>
            </Button>
          </div>
        </div>
      )}
      {origem.catalogo_mudou && (
        <p className="rounded-md bg-muted p-2 text-xs">
          O catálogo mudou desde que esta versão foi salva (preço ou dado conferido): os números
          usam o catálogo atual.
        </p>
      )}
      {origem.pecas_fora_do_catalogo.length > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs dark:border-amber-800 dark:bg-amber-950/40">
          Peças que saíram do catálogo (usamos a cópia guardada na versão):{" "}
          {origem.pecas_fora_do_catalogo.join(", ")}.
        </p>
      )}
      <div>
        <h3 className="flex items-center gap-1.5 font-semibold">
          <History aria-hidden="true" className="size-4" /> Versões ({origem.versoes.length})
        </h3>
        <ol className="mt-2 space-y-1.5">
          {origem.versoes.map((v) => (
            <li
              key={v.numero}
              aria-current={v.numero === origem.versao ? "true" : undefined}
              className="rounded-md border p-2 text-xs aria-[current=true]:border-primary aria-[current=true]:bg-accent"
            >
              <p className="flex items-center justify-between gap-2 font-medium">
                <span>
                  Versão {v.numero}
                  {v.numero === origem.versao_atual ? " (atual)" : ""}
                </span>
                <span className="font-normal text-muted-foreground">{dataHoraBr(v.criado_em)}</span>
              </p>
              <p className="mt-0.5 text-muted-foreground">{v.motivo}</p>
              {v.numero !== origem.versao && (
                <Link
                  href={
                    v.numero === origem.versao_atual
                      ? `/projetos/${origem.id}`
                      : `/projetos/${origem.id}?versao=${v.numero}`
                  }
                  className="mt-1 inline-block underline underline-offset-2"
                >
                  Ver esta versão
                </Link>
              )}
            </li>
          ))}
        </ol>
      </div>

      <Button
        variant="ghost"
        size="xs"
        className="text-red-700 dark:text-red-400"
        onClick={() => setApagar(true)}
      >
        <Trash2 aria-hidden="true" /> Apagar o projeto
      </Button>
      <Dialog open={apagar} onOpenChange={setApagar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar &ldquo;{origem.titulo}&rdquo;?</DialogTitle>
            <DialogDescription>
              O projeto e as {origem.versoes.length} versões somem do seu computador. Os builds de
              referência e o catálogo não mudam. Não dá para desfazer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pendente}
              onClick={() => rodar(() => deleteProjectAction(origem.id))}
            >
              {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
              Apagar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
