import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";

/**
 * LOG DE ATIVIDADES DOS ALUNOS (pedido da cliente em 02/09/2026).
 * ============================================================================
 *
 * Palavras dela: "registrar praticamente todas as ações realizadas pelos alunos
 * dentro da plataforma, permitindo acompanhar o comportamento e a utilização
 * dos diferentes recursos". Filtros: usuário, período, tipo de atividade, área
 * ou recurso, disciplina, conteúdo e ação.
 *
 * ⚠️ O LOG É DERIVADO DAS TABELAS QUE JÁ REGISTRAM CADA AÇÃO, e essa é a
 * decisão central deste arquivo.
 *
 * O caminho óbvio seria instrumentar a aplicação inteira com um `recordEvent`
 * em cada clique, gravando numa tabela nova. Isso teria dois problemas graves:
 *
 *   1. O log nasceria VAZIO. Tudo o que os alunos fizeram até hoje — respostas,
 *      estudos, revisões, resgates — ficaria de fora, e a cliente abriria a tela
 *      no dia da entrega e veria nada.
 *
 *   2. Seriam dezenas de pontos de escrita novos no caminho quente, cada um uma
 *      chance de erro, num pool com teto de 15 conexões.
 *
 * `question_attempts`, `study_logs`, `content_progress`, `review_occurrences`,
 * `store_redemptions` e `analytics_events` JÁ guardam quem fez o quê e quando,
 * com disciplina e assunto ao lado. A união abaixo lê essas linhas e as
 * apresenta como um fluxo único. O log funciona desde o primeiro dia da
 * plataforma, sem escrever um byte a mais.
 *
 * ⚠️ ESTA TELA LÊ DADO PESSOAL DE TERCEIROS. `requireAdmin` na página, e nada
 * daqui aparece em tela de aluno.
 */

export type ActivityArea =
  | "questoes"
  | "estudos"
  | "revisoes"
  | "loja"
  | "conquistas"
  | "preparacao"
  /** Pedido da cliente em 18/09/2026: saber quem abriu cada jogo. */
  | "jogos";

export type ActivityRow = {
  occurredAt: Date;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  area: ActivityArea;
  /** A ação, já em pt-BR. */
  action: string;
  subjectName: string | null;
  topicName: string | null;
  /** Complemento livre: técnica, minutos, item resgatado. */
  detail: string | null;
};

export type ActivityFilters = {
  userId?: string | null;
  area?: ActivityArea | null;
  canonicalSubjectId?: string | null;
  /** Início do período, em data civil. */
  from?: string | null;
  to?: string | null;
};

const PAGE_SIZE = 50;

export async function listActivity(input: {
  filters?: ActivityFilters;
  page?: number;
}): Promise<{ rows: ActivityRow[]; page: number; hasMore: boolean }> {
  const f = input.filters ?? {};
  const pagina = Math.max(0, input.page ?? 0);

  /*
    ⚠️ OS FILTROS ENTRAM EM CADA RAMO DA UNIÃO, e não por fora.

    Um `where` aplicado depois do `union all` obrigaria o Postgres a materializar
    o histórico inteiro das seis tabelas para então descartar quase tudo. Dentro
    de cada ramo, cada índice faz o seu trabalho antes da união acontecer.
  */
  const porUsuario = f.userId ? sql`and a.user_id = ${f.userId}` : sql``;
  const de = f.from ? sql`and a.occurred_at >= ${f.from}::date` : sql``;
  /* `+ 1 dia` porque a coluna é timestamp e a filtragem é por dia inteiro. */
  const ate = f.to ? sql`and a.occurred_at < (${f.to}::date + interval '1 day')` : sql``;

  const disciplina = f.canonicalSubjectId
    ? sql`and a.canonical_subject_id = ${f.canonicalSubjectId}`
    : sql``;

  const area = f.area ? sql`and a.area = ${f.area}` : sql``;

  const linhas = await db.execute<{
    occurred_at: string;
    user_id: string | null;
    user_name: string | null;
    user_email: string | null;
    area: ActivityArea;
    action: string;
    subject_name: string | null;
    topic_name: string | null;
    detail: string | null;
  }>(sql`
    with atividade as (
      -- Questões respondidas
      select qa.answered_at                      as occurred_at,
             qa.user_id                          as user_id,
             'questoes'                          as area,
             case
               when qa.source = 'daily_task'    then 'Respondeu questão na Tarefa do Dia'
               when qa.source = 'review'        then 'Respondeu questão na revisão'
               when qa.source = 'mastery_check' then 'Respondeu questão na prova de domínio'
               else 'Respondeu questão no Banco'
             end                                 as action,
             q.canonical_subject_id              as canonical_subject_id,
             ct.name                             as topic_name,
             case when qa.is_correct then 'Acertou' else 'Errou' end as detail
        from question_attempts qa
        join questions q on q.id = qa.question_id
        left join canonical_topics ct on ct.id = q.canonical_topic_id

      union all

      -- Estudo concluído
      select sl.completed_at, sl.user_id, 'estudos',
             'Concluiu um estudo',
             ct.subject_id,
             spt.display_name,
             coalesce(sl.minutes_spent::text || ' min', 'sem duração')
        from study_logs sl
        left join study_plan_topics spt on spt.id = sl.plan_topic_id
        left join canonical_topics ct on ct.id = spt.canonical_topic_id

      union all

      -- Material aberto ou concluído
      select coalesce(cp.completed_at, cp.last_accessed_at), cp.user_id, 'estudos',
             case when cp.status = 'completed'
                  then 'Marcou material como estudado'
                  else 'Abriu um material' end,
             ci.canonical_subject_id,
             ci.title,
             null
        from content_progress cp
        join content_items ci on ci.id = cp.content_item_id

      union all

      -- Revisão realizada
      select ro.completed_at, ro.user_id, 'revisoes',
             'Concluiu uma revisão',
             ct.subject_id,
             spt.display_name,
             null
        from review_occurrences ro
        left join study_plan_topics spt on spt.id = ro.plan_topic_id
        left join canonical_topics ct on ct.id = spt.canonical_topic_id
       where ro.completed_at is not null

      union all

      -- Resgate na Loja
      select sr.created_at, sr.user_id, 'loja',
             'Resgatou um item na Loja',
             null,
             si.name,
             si.cost_coins::text || ' moedas'
        from store_redemptions sr
        join store_items si on si.id = sr.store_item_id

      union all

      -- Conquista desbloqueada
      select ua.unlocked_at, ua.user_id, 'conquistas',
             'Desbloqueou uma conquista',
             null,
             ach.name,
             null
        from user_achievements ua
        join achievements ach on ach.id = ua.achievement_id
       where ua.unlocked_at is not null

      union all

      -- Jogo aberto (gravado pela página do jogo, ver jogos/[id]/page.tsx)
      select ae.occurred_at, ae.user_id, 'jogos',
             'Abriu um jogo',
             null,
             ae.properties->>'title',
             null
        from analytics_events ae
       where ae.user_id is not null
         and ae.name = 'game_opened'

      union all

      -- Marcos da preparação, que já eram registrados
      select ae.occurred_at, ae.user_id, 'preparacao',
             case ae.name
               when 'preparation_created'   then 'Criou uma preparação'
               when 'edital_uploaded'       then 'Enviou o edital'
               when 'extraction_succeeded'  then 'Edital lido pela IA'
               when 'content_confirmed'     then 'Confirmou o conteúdo do edital'
               when 'diagnosis_completed'   then 'Concluiu o diagnóstico'
               when 'preparation_switched'  then 'Trocou de preparação'
               when 'preparation_archived'  then 'Arquivou uma preparação'
               else ae.name
             end,
             null, null, null
        from analytics_events ae
       where ae.user_id is not null
         /* O jogo tem ramo próprio; sem isto ele apareceria duas vezes, uma delas como "preparação". */
         and ae.name <> 'game_opened'
    )
    select a.occurred_at,
           a.user_id,
           u.name  as user_name,
           u.email as user_email,
           a.area,
           a.action,
           cs.name as subject_name,
           a.topic_name,
           a.detail
      from atividade a
      left join users u on u.id = a.user_id
      left join canonical_subjects cs on cs.id = a.canonical_subject_id
     where a.occurred_at is not null
       ${porUsuario} ${de} ${ate} ${disciplina} ${area}
     order by a.occurred_at desc
     limit ${PAGE_SIZE + 1} offset ${pagina * PAGE_SIZE}
  `);

  /*
    Pede uma linha a mais do que cabe na página só para saber se existe próxima.
    Um `count(*)` sobre a união inteira custaria a varredura completa a cada
    abertura da tela, para exibir um número que ninguém lê.
  */
  const temMais = linhas.length > PAGE_SIZE;

  return {
    rows: linhas.slice(0, PAGE_SIZE).map((l) => ({
      occurredAt: new Date(l.occurred_at),
      userId: l.user_id,
      userName: l.user_name,
      userEmail: l.user_email,
      area: l.area,
      action: l.action,
      subjectName: l.subject_name,
      topicName: l.topic_name,
      detail: l.detail,
    })),
    page: pagina,
    hasMore: temMais,
  };
}
