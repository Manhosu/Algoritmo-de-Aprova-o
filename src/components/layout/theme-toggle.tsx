"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

/**
 * Alternância de tema claro / escuro (README 2.2).
 *
 * ⚠️ "SISTEMA" SAIU A PEDIDO DA CLIENTE (02/09/2026).
 *
 * Ele existia para quem configura o celular para escurecer à noite, e o
 * argumento continua de pé. Só que a escolha do que a aluna vê é dela, e a
 * observação foi direta: três botões num menu estreito, com um deles nomeando
 * um conceito que não é o tema em si, confundem mais do que ajudam.
 *
 * ⚠️ O ESTADO SÓ É LIDO DEPOIS DE MONTAR. O tema real mora no `localStorage` e
 * na preferência do sistema, que não existem no servidor: renderizar o botão
 * ativo no HTML daria uma marcação diferente da do navegador, e o React
 * reclamaria de hidratação. `useSyncExternalStore` devolve `false` no servidor
 * e `true` no cliente, que é a forma suportada de perguntar "já montou?".
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const montado = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  /*
    ⚠️ QUEM JÁ ESTAVA EM "SISTEMA" PRECISA SAIR DE LÁ.

    A opção sumiu da tela, mas o valor continua gravado no `localStorage` de
    quem o escolheu. Sem esta migração, essas pessoas abririam o menu e não
    veriam botão nenhum aceso — um controle que não diz em que estado está é
    pior que o terceiro botão que acabamos de remover.

    A troca é para o tema que o sistema já estava resolvendo, então nada muda
    na tela: só o rótulo passa a ser um dos dois que restaram.
  */
  useEffect(() => {
    if (montado && theme === "system" && resolvedTheme) setTheme(resolvedTheme);
  }, [montado, theme, resolvedTheme, setTheme]);

  const opcoes = [
    { valor: "light", rotulo: "Claro", icone: <Sun className="size-4" /> },
    { valor: "dark", rotulo: "Escuro", icone: <Moon className="size-4" /> },
  ] as const;

  return (
    <div
      /*
        ⚠️ GRADE DE COLUNAS IGUAIS, e não `flex` com `flex-1`.

        O menu tem 238px, e com `flex` o botão mais largo empurrava o outro até
        cortá-lo na borda. Na grade, cada opção recebe a mesma fatia e o texto
        encolhe junto em vez de vazar.
      */
      className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1"
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
