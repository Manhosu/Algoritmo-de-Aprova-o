import type { Metadata } from "next";
import Link from "next/link";

import { MaterialGrid } from "@/components/content/material-grid";
import { getStudentContext } from "@/server/auth/current-user";
import { requireUser } from "@/server/auth/guards";
import { getLibrary, type LibraryFilters } from "@/server/content/library";

export const metadata: Metadata = {
  title: "Estudos",
  description: "Mapas mentais, flashcards e textos dos assuntos do seu edital.",
};

export const dynamic = "force-dynamic";

const TIPOS = [
  { valor: null, rotulo: "Tudo" },
  { valor: "mind_map", rotulo: "Mapas mentais" },
  { valor: "flashcard_deck", rotulo: "Flashcards" },
  { valor: "study_text", rotulo: "Resumos" },
  { valor: "video", rotulo: "Videoaulas" },
] as const;

type Params = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function EstudosPage({ searchParams }: Params) {
  const session = await requireUser("/estudos");
  const [params, contexto] = await Promise.all([searchParams, getStudentContext()]);

  const tipo = typeof params.tipo === "string" ? params.tipo : null;
  const disciplina = typeof params.disciplina === "string" ? params.disciplina : null;
  const soMeuPlano = params.plano === "1";
  /*
    ⚠️ O assunto vem do link da Tarefa do Dia ("Estude: Mapa Mental — Crase") e
    NÃO tem botão de filtro na tela: ele é um recorte que chega de fora, não uma
    escolha que o aluno faz aqui. Por isso aparece como aviso removível em vez
    de virar mais uma fileira de opções.
  */
  const assunto = typeof params.assunto === "string" ? params.assunto : null;

  const preparacao = contexto?.currentPreparation ?? null;

  const biblioteca = await getLibrary({
    userId: session.user.id,
    preparationId: preparacao?.id ?? null,
    filters: {
      type: (tipo as LibraryFilters["type"]) ?? null,
      canonicalSubjectId: disciplina,
      topicSlug: assunto,
      onlyMyPlan: soMeuPlano,
    },
  });

  /*
    O link de cada filtro preserva os outros. Sem isto, escolher "Flashcards"
    depois de escolher uma disciplina apagaria a disciplina — e o aluno teria
    que refazer a escolha a cada troca.
  */
  const comFiltro = (mudanca: Record<string, string | null>) => {
    const atual = new URLSearchParams();
    if (tipo) atual.set("tipo", tipo);
    if (disciplina) atual.set("disciplina", disciplina);
    if (soMeuPlano) atual.set("plano", "1");
    if (assunto) atual.set("assunto", assunto);

    for (const [chave, valor] of Object.entries(mudanca)) {
      if (valor === null) atual.delete(chave);
      else atual.set(chave, valor);
    }

    const query = atual.toString();
    return query ? `/estudos?${query}` : "/estudos";
  };

  const noPlano = biblioteca.items.filter((item) => item.inPlan).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 pb-bottom-nav">
      <header>
        <p className="text-eyebrow">Biblioteca</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Estudos</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          {noPlano > 0
            ? `${noPlano} ${noPlano === 1 ? "material do seu edital" : "materiais do seu edital"} aparecem primeiro.`
            : "Mapas mentais, flashcards e textos para estudar antes de praticar."}
        </p>
      </header>

      {assunto ? (
        /*
          ⚠️ O aluno chegou aqui por um link da Tarefa do Dia, e a lista está
          recortada num assunto. Sem este aviso ele veria uma biblioteca quase
          vazia e concluiria que quase não há material — em vez de entender que
          está vendo o recorte que pediu.
        */
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-pretty text-foreground">
          <span className="min-w-0 flex-1">
            Mostrando só o material de{" "}
            <strong>{biblioteca.items[0]?.topicName ?? "um assunto"}</strong>.
          </span>
          <Link
            href={comFiltro({ assunto: null })}
            className="shrink-0 text-primary underline-offset-4 hover:underline"
          >
            Ver todo o acervo
          </Link>
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <nav aria-label="Tipo de material" className="-mx-4 overflow-x-auto no-scrollbar px-4">
          <ul className="flex w-max gap-2">
            {TIPOS.map((opcao) => {
              const ativo = (opcao.valor ?? null) === tipo;

              return (
                <li key={opcao.rotulo}>
                  <Link
                    href={comFiltro({ tipo: opcao.valor })}
                    aria-current={ativo ? "page" : undefined}
                    className={
                      ativo
                        ? "block rounded-full bg-primary/15 px-4 py-2 text-sm font-semibold text-primary"
                        : "block rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    }
                  >
                    {opcao.rotulo}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          {preparacao ? (
            <Link
              href={comFiltro({ plano: soMeuPlano ? null : "1" })}
              className={
                soMeuPlano
                  ? "rounded-full bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary"
                  : "rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              }
            >
              Só do meu edital
            </Link>
          ) : null}

          {biblioteca.subjects.map((materia) => {
            const ativo = disciplina === materia.id;

            return (
              <Link
                key={materia.id}
                href={comFiltro({ disciplina: ativo ? null : materia.id })}
                className={
                  ativo
                    ? "rounded-full bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary"
                    : "rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                {materia.name}{" "}
                <span className="text-metric opacity-70">{materia.count}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <MaterialGrid items={biblioteca.items} />

      {biblioteca.lockedCount > 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-pretty text-muted-foreground">
          {biblioteca.lockedCount}{" "}
          {biblioteca.lockedCount === 1 ? "material está" : "materiais estão"} disponíveis
          em planos com biblioteca completa.{" "}
          <Link href="/planos" className="text-primary underline-offset-4 hover:underline">
            Ver planos
          </Link>
        </p>
      ) : null}
    </div>
  );
}
