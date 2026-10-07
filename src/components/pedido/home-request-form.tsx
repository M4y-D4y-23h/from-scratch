"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { AUTO_ENVIAR_KEY, PEDIDO_EXEMPLOS } from "./examples";

/**
 * Campo do pedido na página inicial: abre /novo já com o texto e pede para enviar assim que a
 * página abrir (pelo sessionStorage, que um link de fora não consegue preencher).
 */
export function HomeRequestForm() {
  const router = useRouter();
  const [texto, setTexto] = useState("");

  function enviar(pedido: string) {
    const limpo = pedido.trim();
    if (limpo.length < 3) return;
    try {
      sessionStorage.setItem(AUTO_ENVIAR_KEY, limpo);
    } catch {
      // Sem sessionStorage (modo privado restrito): /novo abre preenchido e a pessoa envia.
    }
    router.push(`/novo?pedido=${encodeURIComponent(limpo)}`);
  }

  return (
    <div className="max-w-2xl space-y-3">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
      >
        <label htmlFor="pedido-inicio" className="text-sm font-medium">
          Que drone você quer construir?
        </label>
        <Textarea
          id="pedido-inicio"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Ex.: drone para filmar viagens, até R$ 3.000, que volte sozinho se perder o sinal"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(texto);
          }}
        />
        <Button type="submit" disabled={texto.trim().length < 3}>
          Montar meu projeto <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
      </form>
      <div className="text-sm">
        <p className="text-muted-foreground">Ou comece por um exemplo:</p>
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {PEDIDO_EXEMPLOS.map((e) => (
            <li key={e}>
              <Link
                href={`/novo?pedido=${encodeURIComponent(e)}`}
                className="inline-block rounded-full border px-3 py-1 text-xs hover:bg-accent"
              >
                {e}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
