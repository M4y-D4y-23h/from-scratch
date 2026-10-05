import {
  ArrowRight,
  BookOpen,
  Box,
  Construction,
  Database,
  FolderOpen,
  Gauge,
  MapPin,
  MessagesSquare,
  ShieldAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";

import { dataHoraBr, fmt, fmtMinutes, formatRange } from "@/components/format";
import { Seal } from "@/components/seal";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TIER_LABEL } from "@/domain/categories/drone/build";
import { loadDroneCatalog } from "@/server/catalog/load";
import { getDb } from "@/server/db";
import { referenceCards } from "@/server/project-view/home";
import { listProjects } from "@/server/projects/repository";

type Feature = {
  title: string;
  description: string;
  Icon: LucideIcon;
};

// O que o produto faz (SPEC, "Contexto e missão").
const FEATURES: Feature[] = [
  {
    title: "Projeto em 3D, em escala real",
    description: "Montado a partir de peças reais, com as medidas de verdade.",
    Icon: Box,
  },
  {
    title: "Dificuldade por área",
    description:
      "Mecânica, solda, baterias, configuração, pilotagem: cada área com nível e horas de estudo estimadas.",
    Icon: Gauge,
  },
  {
    title: "Custos em reais",
    description:
      "Peças, ferramentas, consumíveis, equipamento de segurança e importação, sempre como faixa de preço com data.",
    Icon: Wallet,
  },
  {
    title: "Onde fazer cada coisa",
    description:
      "O que comprar e com quem, o que dá para fazer em casa, o que exige serviço externo e onde testar.",
    Icon: MapPin,
  },
  {
    title: "Passo a passo com tutor",
    description:
      "Um tutor por chat que conhece o seu projeto e olha fotos para ajudar a encontrar problemas.",
    Icon: MessagesSquare,
  },
  {
    title: "Riscos às claras",
    description:
      "Alertas explícitos sobre baterias, hélices e regras de voo. Projetos perigosos são recusados.",
    Icon: ShieldAlert,
  },
];

// Selos de confiança (SPEC B.1.2): todo dado da interface tem um destes.
const TRUST_SEALS = [
  {
    symbol: "✅",
    label: "Verificado",
    meaning: "dado com fonte confirmada (datasheet do fabricante).",
  },
  {
    symbol: "⚠️",
    label: "Estimativa",
    meaning: "preço estimado ou valor calculado, como o tempo de voo.",
  },
  { symbol: "❓", label: "Não verificado", meaning: "dado inserido que ainda ninguém confirmou." },
] as const;

export default async function HomePage() {
  // Os projetos ficam no banco local e o catálogo pode mudar pela página /catalogo.
  await connection();
  const cards = referenceCards(loadDroneCatalog());
  const projetos = listProjects(getDb());
  const nomeArquetipo = new Map(cards.map((c) => [c.id, c.nome]));

  return (
    <>
      <SiteHeader atual="inicio" />

      <main id="conteudo" className="mx-auto max-w-6xl px-4 py-10">
        <section aria-labelledby="titulo" className="space-y-4">
          <h1 id="titulo" className="text-4xl font-bold tracking-tight">
            From Scratch
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Descreva o drone que você quer construir. A ferramenta vai mostrar o projeto em 3D com
            peças reais, calcular custos e dificuldade, apontar os riscos e ensinar a montar, passo
            a passo.
          </p>

          <div
            role="status"
            className="flex max-w-2xl items-start gap-3 rounded-lg border border-dashed p-4 text-sm"
          >
            <Construction aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <p>
              <strong>Em construção (Fase 3: painéis e catálogo).</strong> Ainda não dá para criar
              um projeto a partir de um pedido em linguagem natural (Fase 4), mas os três drones de
              referência já mostram 3D, custos, dificuldade, onde fazer, segurança e cálculos, e
              você pode trocar peças com tudo recalculado.
            </p>
          </div>
        </section>

        <section aria-labelledby="titulo-referencias" className="mt-12 space-y-4">
          <div className="space-y-1">
            <h2 id="titulo-referencias" className="text-2xl font-semibold tracking-tight">
              Drones de referência
            </h2>
            <p className="max-w-3xl text-muted-foreground">
              Montados pelo motor de cálculo com peças reais do catálogo, em três faixas de preço.
              Números da faixa econômica; os dados ainda não foram conferidos (❓).
            </p>
          </div>
          <ul className="grid gap-4 md:grid-cols-3">
            {cards.map((c) => (
              <li key={c.id}>
                <Card className="h-full gap-4">
                  <CardHeader>
                    <p className="text-xs text-muted-foreground">{c.firmware}</p>
                    <h3 className="text-lg leading-tight font-semibold">
                      <Link href={`/referencia/${c.id}/economica`} className="hover:underline">
                        {c.nome}
                      </Link>
                    </h3>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-3 text-sm">
                    <p className="text-muted-foreground">{c.para_quem}</p>
                    {c.economica && (
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                        <dt className="text-muted-foreground">Peso</dt>
                        <dd className="text-right">
                          {c.economica.massa_g !== undefined
                            ? `${fmt(c.economica.massa_g, 0)} g`
                            : "sem dado"}
                        </dd>
                        <dt className="text-muted-foreground">TWR</dt>
                        <dd className="text-right">
                          {c.economica.twr !== undefined ? fmt(c.economica.twr, 1) : "sem dado"}
                        </dd>
                        <dt className="text-muted-foreground">Voo</dt>
                        <dd className="flex items-center justify-end gap-1">
                          {fmtMinutes(c.economica.voo.min, c.economica.voo.max)}
                          <Seal status={c.economica.voo.selo} compacto />
                        </dd>
                        <dt className="text-muted-foreground">Dificuldade</dt>
                        <dd className="text-right">{c.economica.dificuldade}</dd>
                        <dt className="col-span-2 text-muted-foreground">Total com ferramentas</dt>
                        <dd className="col-span-2 flex items-center gap-1 font-medium">
                          {formatRange(c.economica.total)}
                          <Seal status={c.economica.total.status} compacto />
                        </dd>
                      </dl>
                    )}
                    <nav aria-label={`Faixas de ${c.nome}`} className="mt-auto">
                      <ul className="flex flex-wrap gap-1.5">
                        {c.faixas.map((f) => (
                          <li key={f}>
                            <Link
                              href={`/referencia/${c.id}/${f}`}
                              className="inline-block rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
                            >
                              {TIER_LABEL[f]}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </nav>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="titulo-projetos" className="mt-12 space-y-4">
          <h2 id="titulo-projetos" className="text-2xl font-semibold tracking-tight">
            Seus projetos
          </h2>
          {projetos.length === 0 ? (
            <p className="flex max-w-2xl items-start gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
              <FolderOpen aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              Ainda não há projetos. Abra um drone de referência e use &ldquo;Trocar&rdquo; numa
              peça: o From Scratch cria o seu projeto, com as trocas salvas em versões.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {projetos.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/projetos/${p.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-accent"
                  >
                    <span>
                      <span className="font-medium">{p.titulo}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p.arquetipo_id
                          ? (nomeArquetipo.get(p.arquetipo_id) ?? p.arquetipo_id)
                          : ""}
                        {p.faixa_origem
                          ? `, faixa ${TIER_LABEL[p.faixa_origem].toLowerCase()}`
                          : ""}
                        {" · "}versão {p.versao_atual} · atualizado em{" "}
                        {dataHoraBr(p.atualizado_em.toISOString())}
                      </span>
                    </span>
                    <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="titulo-ferramentas" className="mt-12 grid gap-4 sm:grid-cols-2">
          <h2 id="titulo-ferramentas" className="sr-only">
            Catálogo e glossário
          </h2>
          <Link href="/catalogo" className="rounded-lg border p-4 hover:bg-accent">
            <span className="flex items-center gap-2 font-semibold">
              <Database aria-hidden="true" className="size-5" /> Catálogo
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Peças, tabelas de empuxo, ferramentas e drones prontos: confira com a fonte, marque
              como verificado e atualize preços com a data.
            </span>
          </Link>
          <Link href="/glossario" className="rounded-lg border p-4 hover:bg-accent">
            <span className="flex items-center gap-2 font-semibold">
              <BookOpen aria-hidden="true" className="size-5" /> Glossário
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Os termos técnicos (KV, LiPo, ESC, TWR, failsafe...) explicados de um jeito simples,
              com analogias.
            </span>
          </Link>
        </section>

        <section aria-labelledby="titulo-recursos" className="mt-12">
          <h2 id="titulo-recursos" className="text-2xl font-semibold tracking-tight">
            O que a ferramenta faz
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ title, description, Icon }) => (
              <li key={title}>
                <Card className="h-full">
                  <CardHeader>
                    <Icon aria-hidden="true" className="size-6 text-muted-foreground" />
                    <h3 className="leading-none font-semibold">{title}</h3>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">{description}</CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="titulo-honestidade" className="mt-12 max-w-2xl space-y-4">
          <h2 id="titulo-honestidade" className="text-2xl font-semibold tracking-tight">
            Regra de ouro: nunca mentir para encorajar
          </h2>
          <p className="text-muted-foreground">
            Se um projeto não voaria, custaria mais do que o seu orçamento ou for perigoso, a
            ferramenta diz isso com clareza, mostra os números e sugere a alternativa viável mais
            próxima. Cada informação vem com um selo que diz o quanto ela é confiável:
          </p>
          <ul className="space-y-2">
            {TRUST_SEALS.map(({ symbol, label, meaning }) => (
              <li key={label} className="flex gap-2">
                <span aria-hidden="true">{symbol}</span>
                <span>
                  <strong>{label}:</strong> {meaning}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground">
          Uso pessoal, rodando localmente. Regras de voo e de rádio mudam: confira sempre as regras
          vigentes.
        </div>
      </footer>
    </>
  );
}
