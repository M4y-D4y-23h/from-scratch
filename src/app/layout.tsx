import type { Metadata } from "next";

import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "From Scratch",
    template: "%s · From Scratch",
  },
  description:
    "Descreva o drone que você quer construir e receba um projeto real: peças, custos, dificuldade, riscos e passo a passo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: o next-themes troca a classe do <html> antes do
    // React hidratar (evita "piscar" o tema errado); o aviso seria falso alarme.
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
