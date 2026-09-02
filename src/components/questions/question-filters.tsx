"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { FilterCatalog } from "@/server/questions/service";

/**
 * Filtros do banco de questões (README 1.9): banca, disciplina, assunto e
 * dificuldade.
 *
 * O ESTADO MORA NA URL
 * ----------------------------------------------------------------------------
 * Cada filtro é um parâmetro de busca. Isso dá três coisas de graça: o aluno
 * volta com o botão do navegador e continua onde estava, pode salvar ou
 * compartilhar uma lista filtrada, e os links da Tarefa do Dia
 * (`/questoes?assunto=crase`) caem exatamente na mesma tela sem código
 * especial.
 *
 * ⚠️ A banca NÃO é travada na do edital do aluno. É aviso explícito do README:
 * limitar deixaria a maioria com pouquíssimo conteúdo enquanto o acervo é
 * construído.
 */

const DIFFICULTIES = [
  { value: "easy", label: "Fácil" },
  { value: "medium", label: "Média" },
  { value: "hard", label: "Difícil" },
] as const;

export function QuestionFilters({
  catalog,
  active,
}: {
  catalog: FilterCatalog;
  active: {
    banca: string | null;
    disciplina: string | null;
    assunto: string | null;
    dificuldade: string | null;
    naoRespondidas: boolean;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  /*
    ⚠️ ABERTO POR PADRÃO (pedido da cliente).

    Quem entra no Banco de Questões quase sempre quer recortar por disciplina
    ou assunto antes de começar. Fechado, o filtro escondia a primeira ação da
    tela atrás de um clique que nem todo mundo descobre que existe.
  */
  const [open, setOpen] = useState(true);

  function apply(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);

    // Trocar de filtro volta para a primeira página: manter a página 3 de uma
    // busca que agora tem uma página só devolveria uma lista vazia.
    next.delete("pagina");

    // Trocar a disciplina invalida o assunto escolhido dentro da anterior.
    if (key === "disciplina") next.delete("assunto");

    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  const topics = active.disciplina
    ? catalog.topics.filter((topic) => topic.subjectId === active.disciplina)
    : catalog.topics;

  const activeCount =
    (active.banca ? 1 : 0) +
    (active.disciplina ? 1 : 0) +
    (active.assunto ? 1 : 0) +
    (active.dificuldade ? 1 : 0);

  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <SlidersHorizontal className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="flex-1 text-sm font-medium text-foreground">Filtros</span>
        {activeCount > 0 ? (
          <span className="text-metric rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">
            {activeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="flex flex-col gap-4 border-t border-border p-4">
          <Select
            label="Banca"
            value={active.banca}
            options={catalog.boards}
            emptyLabel="Todas as bancas"
            onChange={(value) => apply("banca", value)}
            hint="Você pode praticar com questões de outras bancas além da do seu edital."
          />

          <Select
            label="Disciplina"
            value={active.disciplina}
            options={catalog.subjects}
            emptyLabel="Todas as disciplinas"
            onChange={(value) => apply("disciplina", value)}
          />

          <Select
            label="Assunto"
            value={active.assunto}
            options={topics}
            emptyLabel="Todos os assuntos"
            onChange={(value) => apply("assunto", value)}
          />

          <div>
            <span className="mb-2 block text-sm font-medium text-foreground">
              Dificuldade
            </span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Dificuldade">
              {DIFFICULTIES.map((level) => {
                const selected = active.dificuldade === level.value;
                return (
                  <button
                    key={level.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => apply("dificuldade", selected ? null : level.value)}
                    className={cn(
                      "min-h-11 rounded-lg border px-4 text-sm transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      selected
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {level.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={active.naoRespondidas}
              onChange={(event) =>
                apply("naoRespondidas", event.target.checked ? "1" : null)
              }
              className="size-4 accent-[var(--primary)]"
            />
            Esconder questões resolvidas
          </label>

          {activeCount > 0 ? (
            <button
              type="button"
              onClick={() => router.replace(pathname, { scroll: false })}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-4" aria-hidden />
              Limpar filtros
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  emptyLabel,
  hint,
  onChange,
}: {
  label: string;
  value: string | null;
  options: Array<{ id: string; label: string }>;
  emptyLabel: string;
  hint?: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        /*
          ⚠️ `[&>option]` PINTA A LISTA ABERTA, e sem isso ela some.

          O navegador não herda a cor do `select` para as `option`: no Windows e
          no Android ele abre a lista com o branco do sistema, e o nosso texto
          claro fica branco sobre branco. As opções estão lá, e a cliente relata
          que "não estão aparecendo os assuntos para escolher".

          É o mesmo defeito que ela já tinha visto no seletor de banca do
          cadastro da preparação. Lá foi corrigido; aqui tinha ficado.
        */
        className="min-h-11 rounded-lg border border-border bg-input px-3 text-sm text-foreground [&>option]:bg-card [&>option]:text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
