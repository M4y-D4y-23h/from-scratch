import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ImportParamsForm, JsonEditorForm } from "@/components/catalog/forms";
import { dataBr, fmt, formatRange } from "@/components/format";
import { SiteHeader } from "@/components/site-header";
import { importedPriceRange } from "@/domain/core/importacao";
import { loadDroneCatalog } from "@/server/catalog/load";
import { readImportParams } from "@/server/catalog/write";

/*
 * Câmbio e impostos de importação (SPEC B.6): as regras mudam, então são parâmetros editáveis com
 * data, nunca valores fixos no código. Todos os preços em US$ são convertidos com eles.
 */

export const metadata: Metadata = { title: "Catálogo: importação" };

export default async function ImportParamsPage() {
  await connection();
  const bruto = readImportParams();
  const params = loadDroneCatalog().catalog.importacao;
  if (!bruto || !params) notFound();
  const exemplos = [20, 40, 100].map((usd) => ({
    usd,
    faixa: importedPriceRange({ min: usd, max: usd, data: params.cambio.data }, params),
  }));
  return (
    <>
      <SiteHeader atual="catalogo" />
      <main id="conteudo" className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div className="space-y-2">
          <Link
            href="/catalogo"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeft aria-hidden="true" className="size-4" /> Catálogo
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Câmbio e impostos de importação</h1>
          <p className="text-muted-foreground">{params.aviso}</p>
        </div>

        <section aria-labelledby="sec-atual" className="space-y-3 rounded-xl border p-4">
          <h2 id="sec-atual" className="text-lg font-semibold">
            Valores atuais (conferidos em {dataBr(params.verificado_em)})
          </h2>
          <ul className="space-y-1 text-sm">
            <li>
              Câmbio: R$ {fmt(params.cambio.usd_brl, 4)} por US$ ({dataBr(params.cambio.data)})
            </li>
            <li>
              ICMS: {fmt(params.icms_pct[0])}% a {fmt(params.icms_pct[1])}% (conforme o estado,
              cobrado &ldquo;por dentro&rdquo;)
            </li>
            {params.faixas_ii.map((f) => (
              <li key={f.ate_usd}>
                Imposto de importação até US$ {fmt(f.ate_usd)}: {fmt(f.aliquota_pct)}%
                {f.deducao_usd > 0 ? ` menos US$ ${fmt(f.deducao_usd)}` : ""}
              </li>
            ))}
          </ul>
          <p className="text-sm">
            Exemplos (peça sozinha num pacote → dentro de um pacote grande):{" "}
            {exemplos.map((e) => `US$ ${e.usd} → ${formatRange(e.faixa)}`).join("; ")}.
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {[params.cambio.fonte, ...params.fontes].map((f) => (
              <li key={`${f.titulo}-${f.url ?? ""}`}>
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
        </section>

        <section aria-labelledby="sec-editar" className="space-y-3 rounded-xl border p-4">
          <h2 id="sec-editar" className="text-lg font-semibold">
            Atualizar
          </h2>
          <ImportParamsForm
            versao={bruto.versao}
            atual={{
              usd_brl: params.cambio.usd_brl,
              data_cambio: params.cambio.data,
              icms: [params.icms_pct[0], params.icms_pct[1]],
              verificado_em: params.verificado_em,
            }}
          />
        </section>

        <section aria-labelledby="sec-json" className="space-y-3 rounded-xl border p-4">
          <h2 id="sec-json" className="text-lg font-semibold">
            Editar em JSON (faixas do imposto, aviso, fontes)
          </h2>
          <JsonEditorForm
            kind="importacao"
            id="importacao"
            versao={bruto.versao}
            json={JSON.stringify(bruto.item, null, 2)}
            importacao
          />
        </section>
      </main>
    </>
  );
}
