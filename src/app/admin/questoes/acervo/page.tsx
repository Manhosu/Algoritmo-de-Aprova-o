import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/server/auth/guards";
import { listQuestionsForAdmin } from "@/server/admin/question-admin";
import { loadCatalog } from "@/server/taxonomy/mapping";

export const metadata: Metadata = { title: "Acervo de questões" };

export const dynamic = "force-dynamic";

const ROTULO_DIFICULDADE: Record<string, string> = {
  easy: "Fácil",
  medium: "Média",
  hard: "Difícil",
};

const ROTULO_SITUACAO: Record<string, string> = {
  draft: "Rascunho",
  published: "Publicada",
  archived: "Arquivada",
};

/**
 * O ACERVO QUESTÃO A QUESTÃO, para revisar e corrigir (pedido de 02/09/2026).
 * ============================================================================
 *
 * A aba Questões mostra o acervo em números — quanto entrou, por disciplina, por
 * banca. Esta mostra as questões em si, que é o que a revisão exige.
 *
 * ⚠️ O FILTRO É O PRODUTO AQUI, não um enfeite.
 *
 * São 1.046 questões. Sem filtro, "corrigir a explicação daquela questão de
 * Crase" significa paginar até encontrar. Com disciplina, assunto, dificuldade,
 * situação e busca no enunciado, chega-se a um punhado em um clique.
 */
export default async function AcervoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const um = (chave: string) => {
    const valor = params[chave];
    const texto = Array.isArray(valor) ? valor[0] : valor;
    return texto?.trim() || null;
  };

  const disciplinaId = um("disciplina");
  const assuntoId = um("assunto");
  const busca = um("busca");
  const pagina = Number(um("pagina") ?? "0") || 0;

  const [catalogo, resultado] = await Promise.all([
    loadCatalog(),
    listQuestionsForAdmin({
      page: pagina,
      filters: {
        canonicalSubjectId: disciplinaId,
        canonicalTopicId: assuntoId,
        difficulty: dificuldadeValida(um("dificuldade")),
        status: situacaoValida(um("situacao")),
        search: busca,
        missingExplanation: um("semComentario") === "1",
      },
    }),
  ]);

  /*
    Os assuntos são filtrados pela disciplina escolhida. Uma lista com os 200
    assuntos do catálogo inteiro é pior que nenhuma: quem procura "Crase" teria
    de achá-la no meio de Direito Constitucional e Informática.
  */
  const assuntos = disciplinaId
    ? catalogo.topics.filter((t) => t.subjectId === disciplinaId)
    : [];

  const aviso = um("aviso");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header>
        <p className="text-eyebrow">
          <Link href="/admin/questoes" className="hover:text-foreground">
            Questões
          </Link>{" "}
          › Acervo
        </p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Acervo de questões</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          {resultado.total === 0
            ? "Nenhuma questão com esses filtros."
            : `${resultado.total} ${resultado.total === 1 ? "questão" : "questões"}. Clique para editar.`}
        </p>
      </header>

      {aviso ? (
        <p
          role="status"
          className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground"
        >
          {aviso === "arquivada"
            ? "Questão arquivada. Ela saiu de circulação, e as respostas que os alunos já deram foram preservadas."
            : "Questão excluída."}
        </p>
      ) : null}

      {/*
        ⚠️ FORMULÁRIO GET, sem JavaScript.

        Os filtros viram parâmetros da URL, então o estado da busca é o
        endereço: a cliente pode guardar nos favoritos "as questões de Crase sem
        comentário" e voltar nele amanhã. Um filtro em estado de componente
        perderia tudo no primeiro F5.
      */}
      <form
        method="get"
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Disciplina</span>
            <select
              name="disciplina"
              defaultValue={disciplinaId ?? ""}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm [&>option]:bg-card [&>option]:text-foreground"
            >
              <option value="">Todas</option>
              {catalogo.subjects.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Assunto</span>
            <select
              name="assunto"
              defaultValue={assuntoId ?? ""}
              disabled={assuntos.length === 0}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50 [&>option]:bg-card [&>option]:text-foreground"
            >
              <option value="">
                {assuntos.length === 0 ? "Escolha a disciplina primeiro" : "Todos"}
              </option>
              {assuntos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Dificuldade</span>
            <select
              name="dificuldade"
              defaultValue={um("dificuldade") ?? ""}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm [&>option]:bg-card [&>option]:text-foreground"
            >
              <option value="">Todas</option>
              {Object.entries(ROTULO_DIFICULDADE).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-foreground">Situação</span>
            <select
              name="situacao"
              defaultValue={um("situacao") ?? ""}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm [&>option]:bg-card [&>option]:text-foreground"
            >
              <option value="">Todas</option>
              {Object.entries(ROTULO_SITUACAO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Buscar no enunciado</span>
          <input
            type="search"
            name="busca"
            defaultValue={busca ?? ""}
            placeholder="Um trecho do texto da questão"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="semComentario"
            value="1"
            defaultChecked={um("semComentario") === "1"}
            className="size-4 accent-primary"
          />
          <span className="text-foreground">Só as que estão sem comentário</span>
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Filtrar
          </button>
          <Link
            href="/admin/questoes/acervo"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Limpar
          </Link>
        </div>
      </form>

      <ul className="flex flex-col gap-2">
        {resultado.rows.map((questao) => (
          <li key={questao.id}>
            <Link
              href={`/admin/questoes/acervo/${questao.id}`}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
            >
              <p className="text-pretty text-sm text-foreground">
                {questao.statement.length > 220
                  ? `${questao.statement.slice(0, 220)}…`
                  : questao.statement}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{questao.subjectName}</span>
                {questao.topicName ? <span>{questao.topicName}</span> : null}
                <span>{ROTULO_DIFICULDADE[questao.difficulty] ?? questao.difficulty}</span>
                <span>{ROTULO_SITUACAO[questao.status] ?? questao.status}</span>
                <span>
                  {questao.attemptCount} {questao.attemptCount === 1 ? "resposta" : "respostas"}
                </span>
                {/*
                  Questão publicada sem comentário é o defeito que a cliente mais
                  vai querer caçar: ela chega ao aluno como um erro sem lição.
                */}
                {!questao.hasExplanation ? (
                  <span className="font-medium text-warning">sem comentário</span>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {resultado.pages > 1 ? (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Paginação">
          <PaginaLink params={params} pagina={pagina - 1} desabilitado={pagina === 0}>
            Anterior
          </PaginaLink>
          <span className="text-muted-foreground">
            Página {pagina + 1} de {resultado.pages}
          </span>
          <PaginaLink
            params={params}
            pagina={pagina + 1}
            desabilitado={pagina + 1 >= resultado.pages}
          >
            Próxima
          </PaginaLink>
        </nav>
      ) : null}
    </div>
  );
}

/** Mantém os filtros ao trocar de página — perdê-los seria recomeçar a busca. */
function PaginaLink({
  params,
  pagina,
  desabilitado,
  children,
}: {
  params: Record<string, string | string[] | undefined>;
  pagina: number;
  desabilitado: boolean;
  children: React.ReactNode;
}) {
  if (desabilitado) {
    return <span className="rounded-lg border border-border px-3 py-2 opacity-40">{children}</span>;
  }

  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    const texto = Array.isArray(valor) ? valor[0] : valor;
    if (texto && chave !== "pagina" && chave !== "aviso") busca.set(chave, texto);
  }
  busca.set("pagina", String(pagina));

  return (
    <Link
      href={`/admin/questoes/acervo?${busca}`}
      className="rounded-lg border border-border px-3 py-2 font-medium text-foreground hover:border-primary/50"
    >
      {children}
    </Link>
  );
}

function dificuldadeValida(valor: string | null) {
  return valor === "easy" || valor === "medium" || valor === "hard" ? valor : null;
}

function situacaoValida(valor: string | null) {
  return valor === "draft" || valor === "published" || valor === "archived" ? valor : null;
}
