import type { Metadata } from "next";
import Link from "next/link";

import { FlashcardImportForm } from "@/components/admin/flashcard-import-form";
import { MaterialImportForm } from "@/components/admin/material-import-form";
import { requireAdmin } from "@/server/auth/guards";
import { FLASHCARD_SHEET_COLUMNS } from "@/server/import/flashcards";
import { MATERIAL_SHEET_COLUMNS } from "@/server/import/materials";
import { materialsBySubject } from "@/server/admin/catalog-stats";
import { listMaterialsForAdmin } from "@/server/admin/material-admin";
import { getMindXStats } from "@/server/engine/mindx";

export const metadata: Metadata = { title: "Materiais" };

export const dynamic = "force-dynamic";

/** Nomes em pt-BR para o enum `content_type`, que é escrito em inglês no banco. */
const ROTULO_TIPO: Record<string, string> = {
  flashcard_deck: "Flashcards",
  mind_map: "Mapas mentais",
  video: "Videoaulas",
  mindx: "Mind-X",
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

  const [linhas, itens, mindx, query] = await Promise.all([
    materialsBySubject(),
    listMaterialsForAdmin(),
    getMindXStats(),
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

      {/*
        A importação em lote fica ANTES da lista. O cadastro item a item existe
        logo acima, no botão do cabeçalho; quem chega aqui com uma planilha de
        duzentas linhas precisa achar isto sem rolar.
      */}
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="font-semibold text-foreground">Importar planilha</h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Cada linha é conferida antes de gravar. Reenviar a mesma planilha
            atualiza os materiais em vez de duplicar, então dá para corrigir um
            endereço e mandar de novo.
          </p>
        </div>

        <MaterialImportForm colunas={MATERIAL_SHEET_COLUMNS} />
      </section>

      {/*
        ⚠️ O MIND-X É A ÚNICA PARTE CONTRATADA À PARTE, e até agora a cliente não
        tinha como saber se ela funciona.

        O retorno dela era abrir o feed com a própria conta e ver se aparecia
        vídeo. Isso não responde a pergunta que importa: os alunos assistem?

        "Nunca visto" é o número mais acionável dos quatro. Vídeo publicado que
        ninguém abriu costuma estar num assunto fora dos editais em uso, e aí a
        resposta é gravar sobre outro assunto, não gravar mais.
      */}
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="font-semibold text-foreground">Mind-X</h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Os vídeos curtos do botão central. Eles não aparecem na Biblioteca:
            o feed recorta pelo edital de cada aluno e começa pelas lacunas dele.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Indicador rotulo="Publicados" valor={mindx.published} />
          <Indicador
            rotulo="Nunca vistos"
            valor={mindx.neverSeen}
            alerta={mindx.published > 0 && mindx.neverSeen === mindx.published}
          />
          <Indicador rotulo="Aberturas" valor={mindx.views} />
          <Indicador rotulo="Alunos" valor={mindx.viewers} />
        </dl>

        {mindx.top.length > 0 ? (
          <div>
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Mais vistos
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {mindx.top.map((video) => (
                <li key={video.title} className="flex items-baseline gap-3 text-sm">
                  <span className="text-metric shrink-0 text-xs text-muted-foreground">
                    {video.views}
                  </span>
                  <span className="min-w-0 text-pretty text-foreground">{video.title}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/*
        ⚠️ BARALHO TEM IMPORTAÇÃO PRÓPRIA, e não é capricho de organização.

        Palavras da cliente em 08/09/2026: "tentei cadastrar um arquivo xlsx de
        flashcards e um mapa mental, não deu certo". O mapa mental o botão de
        enviar arquivo resolveu. O baralho não é arquivo: o conteúdo dele são os
        CARTÕES, e cada linha da planilha vira um cartão que o aluno vira na
        tela. Guardar o .xlsx no acervo entregaria uma planilha para download.
      */}
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="font-semibold text-foreground">Importar flashcards</h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Cada linha vira um cartão. Reenviar a mesma planilha substitui os
            cartões do baralho em vez de duplicar, então dá para corrigir uma
            resposta e mandar de novo.
          </p>
        </div>

        <FlashcardImportForm colunas={FLASHCARD_SHEET_COLUMNS} />
      </section>

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

function Indicador({
  rotulo,
  valor,
  alerta = false,
}: {
  rotulo: string;
  valor: number;
  /** Pinta de aviso quando o número conta uma história ruim. */
  alerta?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        {rotulo}
      </dt>
      <dd className={`text-metric text-xl ${alerta ? "text-warning" : "text-foreground"}`}>
        {valor}
      </dd>
    </div>
  );
}
