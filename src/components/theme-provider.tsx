"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// Guarda a escolha de tema (claro, escuro ou do sistema) e aplica a classe
// "dark" no <html>. Padrão do shadcn/ui para Next.js.
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
