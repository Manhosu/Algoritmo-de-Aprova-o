import { ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { QuestionFilters } from "@/components/questions/question-filters";
import { QuestionList } from "@/components/questions/question-list";
import { EmptyState, Surface } from "@/components/shared/surface";
import { LOGIN_ROUTE } from "@/config/routes";
import { getStudentContext } from "@/server/auth/current-user";
import {
  findQuestions,
  findTopicBySlug,
  getFilterCatalog,
} from "@/server/questions/service";

export const metadata: Metadata = { title: "Questões" };

type SearchParams = {
  banca?: string;
  disciplina?: string;
  assunto?: string;
  dificuldade?: string;
  naoRespondidas?: string;
  pagina?: string;
};

/**
 * BANCO DE QUESTÕES (README 1.9).
 *
 * O `?assunto=` aceita duas coisas: o id do assunto canônico (vindo dos
 * filtros) e o SLUG (vindo dos links da Tarefa do Dia). Aceitar os dois é o que
 * faz "🎯 Pratique: Questões — Crase" cair nesta tela já filtrada, sem uma rota
 * separada só para isso.
 */
export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  const [catalog, topicFromSlug] = await Promise.all([
    getFilterCatalog(),
    params.assunto && !isUuid(params.assunto)
      ? findTopicBySlug(params.assunto)
      : Promise.resolve(null),
  ]);

  const topicId = topicFromSlug?.id ?? (isUuid(params.assunto) ? params.assunto! : null);
  const subjectId = topicFromSlug?.subjectId ?? params.disciplina ?? null;
  const page = Math.max(0, Number(params.pagina ?? "0") || 0);

  const result = await findQuestions({
    userId: context.user.id,
    page,
    filters: {
      examBoardId: params.banca ?? null,
      canonicalSubjectId: subjectId,
      canonicalTopicId: topicId,
      difficulty: parseDifficulty(params.dificuldade),
      onlyUnanswered: params.naoRespondidas === "1",
    },
  });

  const pageCount = Math.ceil(result.total / 10);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-4">
      <header>
        <h1 className="text-xl font-bold text-foreground">Questões</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {result.total === 0
            ? "Nenhuma questão com esses filtros."
            : `${result.total} ${result.total === 1 ? "questão disponível" : "questões disponíveis"}`}
          {topicFromSlug ? ` · ${topicFromSlug.name}` : ""}
        </p>
      </header>

      <QuestionFilters
        catalog={catalog}
        active={{
          banca: params.banca ?? null,
          disciplina: subjectId,
          assunto: topicId,
          dificuldade: params.dificuldade ?? null,
          naoRespondidas: params.naoRespondidas === "1",
        }}
      />

      {result.questions.length === 0 ? (
        <Surface>
          <EmptyState
            icon={<HelpCircle />}
            title="Nada por aqui com esses filtros"
            description="O acervo está em construção. Tente tirar um filtro — ou praticar questões de outra banca, que também contam."
          />
        </Surface>
      ) : (
        <QuestionList questions={result.questions} limit={result.limit} />
      )}

      {pageCount > 1 ? (
        <nav className="flex items-center justify-between gap-3" aria-label="Paginação">
          <PageLink params={params} page={page - 1} disabled={page === 0}>
            <ChevronLeft className="size-4" aria-hidden />
            Anterior
          </PageLink>

          <span className="text-metric text-sm text-muted-foreground">
            {page + 1} / {pageCount}
          </span>

          <PageLink params={params} page={page + 1} disabled={page + 1 >= pageCount}>
            Próxima
            <ChevronRight className="size-4" aria-hidden />
          </PageLink>
        </nav>
      ) : null}
    </div>
  );
}

function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: SearchParams;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="flex min-h-11 items-center gap-1.5 px-4 text-sm text-muted-foreground opacity-40">
        {children}
      </span>
    );
  }

  const next = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined) as [string, string][],
  );
  next.set("pagina", String(page));

  return (
    <Link
      href={`/questoes?${next.toString()}`}
      className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-4 text-sm text-foreground transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {children}
    </Link>
  );
}

function parseDifficulty(value?: string): "easy" | "medium" | "hard" | null {
  return value === "easy" || value === "medium" || value === "hard" ? value : null;
}

/** Distingue o id do assunto (filtros) do slug (links da Tarefa do Dia). */
function isUuid(value?: string): boolean {
  return (
    value !== undefined &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
