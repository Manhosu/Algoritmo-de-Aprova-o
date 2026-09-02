import type { Metadata } from "next";

import { requireAdmin } from "@/server/auth/guards";
import { materialsBySubject } from "@/server/admin/catalog-stats";

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
export default async function MateriaisPage() {
  await requireAdmin();
  const linhas = await materialsBySubject();

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
      </header>

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
    </div>
  );
}
