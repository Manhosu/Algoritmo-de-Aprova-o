"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { LIBRARY_FORMATS } from "@/config/library-formats";
import { cn } from "@/lib/utils";

/**
 * OS FILTROS DA BIBLIOTECA — dois menus (pedido da cliente em 08/09/2026).
 *
 * Palavras dela: "no menu da Biblioteca poderia ter dois menus suspensos, um de
 * formato e outro de disciplina, e incluir Áudio".
 *
 * ⚠️ ERAM DUAS FILEIRAS DE PÍLULAS, e ela tem razão sobre por que trocar.
 *
 * A fileira de formatos rolava na horizontal e a de disciplinas quebrava em
 * três linhas conforme o acervo crescia: dez disciplinas ocupavam mais altura
 * que os próprios materiais no celular. Pílula é boa para três ou quatro opções
 * fixas; para uma lista que cresce a cada edital novo, o menu é o controle que o
 * sistema operacional já sabe desenhar — inclusive a rolagem interna.
 *
 * ⚠️ NAVEGA NA MUDANÇA, sem botão "aplicar".
 *
 * Um botão separado cria o estado em que a tela mostra um filtro e a lista
 * mostra outro. Como cada escolha é um link (a página continua sendo servidor),
 * a URL segue compartilhável e o voltar do navegador desfaz filtro por filtro.
 */

export type LibraryFilterMenusProps = {
  /** Valor atual de cada menu, vindo da URL. */
  type: string | null;
  subjectId: string | null;
  subjects: Array<{ id: string; name: string; count: number }>;
  /** Monta a URL preservando os outros filtros. Vem da página. */
  hrefFor: Record<string, string>;
};

/*
 * ⚠️ `[&>option]` NÃO É ENFEITE, e há um teste que o exige.
 *
 * No Windows e no Android o Chrome desenha a lista aberta com as cores do
 * sistema — fundo branco. Com o texto claro do tema, as opções ficam brancas
 * sobre branco: elas existem, recebem clique, e ninguém as vê. A cliente
 * relatou isso duas vezes, em telas diferentes.
 *
 * É uma string simples, e não `cn(...)`, porque o guarda que confere esta regra
 * lê o código: uma chamada de função ele não consegue expandir.
 */
const CLASSE_MENU =
  "h-11 w-full min-w-0 rounded-xl border border-border bg-card px-3 text-sm text-foreground transition-colors hover:border-primary/40 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&>option]:bg-card [&>option]:text-foreground";

export function LibraryFilterMenus({ type, subjectId, subjects, hrefFor }: LibraryFilterMenusProps) {
  const router = useRouter();
  const [navegando, startTransition] = useTransition();

  function ir(chave: string, valor: string) {
    const destino = hrefFor[`${chave}:${valor}`];
    if (destino) startTransition(() => router.push(destino));
  }

  return (
    <div
      className={cn(
        "grid gap-2 sm:grid-cols-2",
        navegando && "opacity-60 transition-opacity",
      )}
    >
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Formato
        </span>
        <select
          value={type ?? ""}
          onChange={(evento) => ir("tipo", evento.target.value)}
          className={CLASSE_MENU}
        >
          {LIBRARY_FORMATS.map((formato) => (
            <option key={formato.rotulo} value={formato.valor ?? ""}>
              {formato.rotulo}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Disciplina
        </span>
        <select
          value={subjectId ?? ""}
          onChange={(evento) => ir("disciplina", evento.target.value)}
          className={CLASSE_MENU}
          disabled={subjects.length === 0}
        >
          <option value="">Todas as disciplinas</option>
          {subjects.map((materia) => (
            <option key={materia.id} value={materia.id}>
              {/* A contagem no rótulo evita escolher uma disciplina vazia. */}
              {materia.name} ({materia.count})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
