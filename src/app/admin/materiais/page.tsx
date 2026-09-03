import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/server/auth/guards";
import { materialsBySubject } from "@/server/admin/catalog-stats";
import { listMaterialsForAdmin } from "@/server/admin/material-admin";

export const metadata: Metadata = { title: "Materiais" };

export const dynamic = "force-dynamic";

/** Nomes em pt-BR para o enum `content_type`, que é escrito em inglês no banco. */
const ROTULO_TIPO: Record<string, string> = {
  flashcard_deck: "Flashcards",
  mind_map: "Mapas mentais",
  video: "Videoaulas",
  study_text: "Resumos",
  pdf: "PDFs",
  audio: "Áudios",
};

/**
 * A biblioteca por disciplina e tipo (README 2.6).
 *
 * ⚠️ AGRUPA POR DISCIPLINA NA TELA, não em mais uma consulta.
 *
 * O banco já devolve as linhas ordenadas por disciplina e tipo; refazer o
 * agrupamento em SQL exigiria uma segunda consulta ou um `jsonb_agg` que a
 * tabela leria pior. Como as linhas chegam ordenadas, montar o mapa aqui é uma
 * passada linear sobre algumas dezenas de itens.
 */
/*
  Os três níveis do README 2.5. `extended` é o do meio e é usado de verdade —
  esquecê-lo no formulário deixaria a cliente sem como cadastrar material do
  plano intermediário, e o teste-guarda dos rótulos pegou a falta.
*/
const ROTULO_ACESSO_MATERIAL: Record<string, string> = {
  limited: "Todos os planos",
  extended: "Ampliado e Completo",
  full: "Só no Completo",
};

const ROTULO_SITUACAO_MATERIAL: Record<string, string> = {
  draft: "Rascunho",
  published: "Publicado",
  archived: "Arquivado",
};

export default async function MateriaisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const [linhas, itens, query] = await Promise.all([
    materialsBySubject(),
    listMaterialsForAdmin(),
    searchParams,
  ]);

  const porDisciplina = new Map<string, typeof linhas>();
  for (const linha of linhas) {
    const atual = porDisciplina.get(linha.subject) ?? [];
    atual.push(linha);
    porDisciplina.set(linha.subject, atual);
  }

  const total = linhas.reduce((soma, l) => soma + l.total, 0);
  const noAr = linhas.reduce((soma, l) => soma + l.published, 0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header>
        <p className="text-eyebrow">Administração</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Materiais</h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          {total} itens na biblioteca, {noAr} disponíveis para os alunos.
        </p>

        <Link
          href="/admin/materiais/novo"
          className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Cadastrar material
        </Link>
      </header>

      {query.aviso === "arquivado" ? (
        <p
          role="status"
          className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground"
        >
          Material arquivado. Ele saiu da biblioteca dos alunos.
        </p>
      ) : null}

      {porDisciplina.size === 0 ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Nenhum material cadastrado ainda.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {[...porDisciplina].map(([disciplina, itens]) => (
            <li
              key={disciplina}
              className="min-w-0 rounded-xl border border-border bg-card p-5"
            >
              <h2 className="text-pretty font-semibold text-foreground">{disciplina}</h2>

              <dl className="mt-3 flex flex-col gap-2 text-sm">
                {itens.map((item) => (
                  <div key={item.type} className="flex items-baseline gap-2">
                    <dt className="min-w-0 flex-1 text-muted-foreground">
                      {ROTULO_TIPO[item.type] ?? item.type}
                    </dt>
                    <dd className="text-metric shrink-0 text-foreground">
                      {item.published}
                      {item.published !== item.total ? (
                        <span className="text-muted-foreground"> de {item.total}</span>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}

      {/*
        A lista item a item, que é onde a cliente edita. O resumo por disciplina
        acima responde "quanto existe"; esta responde "cadê aquele".
      */}
      {itens.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold text-foreground">Todos os materiais</h2>

          <ul className="flex flex-col gap-2">
            {itens.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/admin/materiais/${item.id}`}
                  className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
                >
                  <p className="text-pretty font-medium text-foreground">{item.title}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{ROTULO_TIPO[item.type] ?? item.type}</span>
                    {item.subjectName ? <span>{item.subjectName}</span> : null}
                    {item.topicName ? <span>{item.topicName}</span> : null}
                    <span>
                      {ROTULO_SITUACAO_MATERIAL[item.status] ?? item.status}
                    </span>
                    <span>
                      {ROTULO_ACESSO_MATERIAL[item.requiredAccessLevel] ??
                        item.requiredAccessLevel}
                    </span>
                    {/*
                      Card publicado sem endereço abre e não mostra nada. É a
                      falha que o aluno reporta como "não funciona".
                    */}
                    {item.status === "published" && !item.hasSource ? (
                      <span className="font-medium text-warning">sem endereço</span>
                    ) : null}
                    {!item.subjectName ? (
                      <span className="font-medium text-warning">sem disciplina</span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
