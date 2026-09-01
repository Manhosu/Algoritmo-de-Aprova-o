"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

/**
 * Alternância de tema claro / escuro / do sistema (README 2.2).
 *
 * ⚠️ TRÊS OPÇÕES, E NÃO UM INTERRUPTOR. "Sistema" é o padrão de quem já
 * configurou o celular para escurecer à noite; um interruptor de dois estados
 * obrigaria essa pessoa a trocar o site à mão duas vezes por dia.
 *
 * ⚠️ O ESTADO SÓ É LIDO DEPOIS DE MONTAR. O tema real mora no `localStorage` e
 * na preferência do sistema, que não existem no servidor: renderizar o botão
 * ativo no HTML daria uma marcação diferente da do navegador, e o React
 * reclamaria de hidratação. `useSyncExternalStore` devolve `false` no servidor
 * e `true` no cliente, que é a forma suportada de perguntar "já montou?".
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const montado = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const opcoes = [
    { valor: "light", rotulo: "Claro", icone: <Sun className="size-4" /> },
    { valor: "dark", rotulo: "Escuro", icone: <Moon className="size-4" /> },
    { valor: "system", rotulo: "Sistema", icone: <Monitor className="size-4" /> },
  ] as const;

  return (
    <div
      /*
        ⚠️ GRADE DE TRÊS COLUNAS IGUAIS, e não `flex` com `flex-1`.

        O menu tem 238px, e com `flex` o botão mais largo empurrava os outros:
        "Sistema" saía cortado pela borda. Na grade, cada opção recebe um terço
        exato do espaço, e o texto encolhe junto em vez de vazar.
      */
      className="grid grid-cols-3 gap-1 rounded-lg border border-border p-1"
      role="group"
      aria-label="Tema da interface"
    >
      {opcoes.map((opcao) => {
        const ativo = montado && theme === opcao.valor;

        return (
          <button
            key={opcao.valor}
            type="button"
            onClick={() => setTheme(opcao.valor)}
            aria-pressed={ativo}
            title={opcao.rotulo}
            className={cn(
              "flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-md px-1 text-[0.7rem] transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              ativo
                ? "bg-primary-soft text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opcao.icone}
            <span className="truncate">{opcao.rotulo}</span>
          </button>
        );
      })}
    </div>
  );
}
