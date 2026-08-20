"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Provedor de tema da aplicação.
 *
 * O tema ESCURO é o padrão do produto. A alternância visível para o usuário
 * entra no Marco 2 (README 2.2), mas a estrutura de temas já está pronta —
 * qualquer tela construída daqui em diante nasce funcionando nos dois temas.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
