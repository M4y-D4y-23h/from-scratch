import {
  Box,
  Construction,
  Drone,
  Gauge,
  MapPin,
  MessagesSquare,
  ShieldAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import Link from "next/link";

import { ModeToggle } from "@/components/mode-toggle";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { referenceArchetypes } from "@/server/viewer/reference";

type Feature = {
  title: string;
  description: string;
  Icon: LucideIcon;
};

// O que o produto vai fazer (SPEC, "Contexto e missão"). Nesta fase é só a vitrine.
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

// Selos de confiança (SPEC B.1.2): todo dado da interface terá um destes.
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

export default function HomePage() {
  const arquetipos = referenceArchetypes();
  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
      >
        Pular para o conteúdo
      </a>

      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <Drone aria-hidden="true" className="size-5" />
            <span>From Scratch</span>
          </div>
          <ModeToggle />
        </div>
      </header>

      <main id="conteudo" className="mx-auto max-w-5xl px-4 py-10">
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
              <strong>Em construção (Fase 2: visualizador 3D).</strong> Ainda não é possível criar
              um projeto a partir de um pedido (isso chega na Fase 4), mas o catálogo, o motor de
              cálculo e os três drones de referência em 3D já funcionam.
            </p>
          </div>
        </section>

        <section aria-labelledby="titulo-3d" className="mt-12 space-y-4">
          <h2 id="titulo-3d" className="text-2xl font-semibold tracking-tight">
            Drones de referência em 3D
          </h2>
          <p className="max-w-2xl text-muted-foreground">
            Montados pelo motor de cálculo com peças reais do catálogo, em escala real. Gire, separe
            as peças e clique em cada uma para ver para que serve e quanto custa.
          </p>
          <ul className="grid gap-4 sm:grid-cols-3">
            {arquetipos.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/3d/${a.id}/economica`}
                  className="flex h-full items-center gap-3 rounded-lg border p-4 font-medium hover:bg-accent"
                >
                  <Box aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                  {a.nome}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="titulo-recursos" className="mt-12">
          <h2 id="titulo-recursos" className="text-2xl font-semibold tracking-tight">
            O que a ferramenta vai fazer
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
        <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted-foreground">
          Uso pessoal, rodando localmente. Regras de voo e de rádio mudam: confira sempre as regras
          vigentes.
        </div>
      </footer>
    </>
  );
}
