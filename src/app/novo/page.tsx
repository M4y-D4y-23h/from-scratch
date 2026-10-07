import type { Metadata } from "next";
import { connection } from "next/server";

import { PedidoFlow } from "@/components/pedido/pedido-flow";
import { SiteHeader } from "@/components/site-header";
import { llmMode } from "@/server/llm/client";
import { MAX_PEDIDO } from "@/server/pipeline/run";

/*
 * Novo projeto a partir de um pedido em linguagem natural (SPEC B.10). ?pedido=... só preenche o
 * campo: a análise (que pode custar uma chamada à API) começa por um clique ou pelo campo da
 * página inicial, nunca por um link sozinho.
 */

export const metadata: Metadata = { title: "Novo projeto" };

export default async function NovoPage(props: PageProps<"/novo">) {
  // O modo (IA ou simples) depende do .env.local deste computador.
  await connection();
  const sp = await props.searchParams;
  const bruto = Array.isArray(sp.pedido) ? sp.pedido[0] : sp.pedido;
  const inicial = (bruto ?? "").slice(0, MAX_PEDIDO);
  return (
    <>
      <SiteHeader atual="novo" />
      <main id="conteudo" className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Novo projeto</h1>
          <p className="max-w-3xl text-muted-foreground">
            Conte com as suas palavras o que você quer. O From Scratch escolhe o tipo de drone,
            pergunta só o que faltar e monta até três opções com peças reais, custos em reais e os
            riscos. Se o pedido não for possível, ele explica o porquê com os números e mostra o
            mais perto disso.
          </p>
        </div>
        <PedidoFlow inicial={inicial} modo={llmMode()} />
      </main>
    </>
  );
}
