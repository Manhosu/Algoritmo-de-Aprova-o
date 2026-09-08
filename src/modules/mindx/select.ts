/**
 * MIND-X — a escolha do próximo vídeo (pedido da cliente em 04/09/2026).
 * ============================================================================
 *
 * Palavras dela:
 *
 *   "O Mind-X deve considerar exclusivamente as lacunas de conhecimento
 *    identificadas para aquele aluno. Quanto maior ou mais relevante for a
 *    lacuna, maior deve ser a prioridade de vídeos sobre aquele assunto. O
 *    sistema só poderá apresentar vídeos relacionados às disciplinas/assuntos
 *    que fazem parte do edital do aluno."
 *
 * ⚠️ A REGRA É PURA, e é a metade do recurso que precisa ser confiável.
 *
 * O player é a parte visível; esta é a parte que decide o que ele mostra. Um
 * erro aqui não quebra a tela: ele entrega o vídeo errado, todos os dias, sem
 * ninguém perceber. Por isso mora separado do banco e do React.
 *
 * ⚠️ E ELA TEM UM CAMINHO PARA QUEM NÃO TEM LACUNA MEDIDA.
 *
 * Lacuna exige questões respondidas. Um aluno que acabou de entrar não tem
 * nenhuma, e o feed dele nasceria vazio — logo no dia em que ele está mais
 * curioso. Nesse caso a ordem vem do PESO no edital: ele vê conteúdo desde o
 * primeiro dia, e o feed vai ficando pessoal conforme ele responde.
 */

/** Um vídeo do acervo, já filtrado para o edital do aluno. */
export type MindXVideo = {
  contentItemId: string;
  title: string;
  /** Assunto canônico. Nulo quando o vídeo cobre a disciplina inteira. */
  canonicalTopicId: string | null;
  canonicalSubjectId: string | null;
  /** Quando o aluno viu este vídeo pela última vez. Nulo se nunca viu. */
  lastSeenAt: Date | null;
};

/** O que se sabe sobre um assunto do edital do aluno. */
export type MindXTopicSignal = {
  canonicalTopicId: string | null;
  canonicalSubjectId: string | null;
  /** 0 a 100. Nulo quando ele ainda não respondeu o suficiente. */
  errorPercent: number | null;
  /** Peso do assunto no edital, quando o edital informou. */
  weight: number | null;
};

export type SelectInput = {
  videos: MindXVideo[];
  signals: MindXTopicSignal[];
  now: Date;
  /** Quanto tempo um vídeo visto fica de fora. Padrão: 24 horas. */
  cooldownHours?: number;
};

export type ScoredVideo = MindXVideo & {
  /** Quanto este vídeo importa para este aluno agora. */
  score: number;
  /** Por que ele foi escolhido — vai para a tela. */
  reason: "lacuna" | "peso" | "acervo";
};

/**
 * A janela em que um vídeo já visto não volta.
 *
 * A cliente pediu "cada vídeo fica disponível por 24 horas, seguindo uma
 * dinâmica semelhante aos Stories". Aqui isso vira o inverso: o que foi visto
 * some por 24 horas, e o resto do acervo continua disponível.
 */
export const MINDX_COOLDOWN_HOURS = 24;

export function selectMindXFeed(input: SelectInput): ScoredVideo[] {
  const cooldown = (input.cooldownHours ?? MINDX_COOLDOWN_HOURS) * 3_600_000;

  const porAssunto = new Map<string, MindXTopicSignal>();
  const porDisciplina = new Map<string, MindXTopicSignal>();

  for (const sinal of input.signals) {
    if (sinal.canonicalTopicId) porAssunto.set(sinal.canonicalTopicId, sinal);

    /*
      A disciplina guarda o MAIOR erro entre os assuntos dela. Um vídeo que
      cobre a disciplina inteira serve melhor a quem está mal em algum pedaço
      dela do que a quem vai bem em todos.
    */
    if (sinal.canonicalSubjectId && sinal.errorPercent !== null) {
      const atual = porDisciplina.get(sinal.canonicalSubjectId);
      if (!atual || (atual.errorPercent ?? 0) < sinal.errorPercent) {
        porDisciplina.set(sinal.canonicalSubjectId, sinal);
      }
    }
  }

  /*
    ⚠️ O MAIOR PESO DO EDITAL É O DENOMINADOR, e precisa sair do conjunto real.

    Sem normalizar, um edital que informa "40 questões" e outro que informa "4"
    produziriam escalas incomparáveis, e o peso dominaria ou sumiria conforme o
    concurso. Dividindo pelo maior peso DESTE aluno, a escala é sempre 0 a 1.
  */
  const maiorPeso = Math.max(
    1,
    ...input.signals.map((s) => s.weight ?? 0).filter((p) => Number.isFinite(p)),
  );

  const pontuados = input.videos.map((video): ScoredVideo => {
    const sinal =
      (video.canonicalTopicId ? porAssunto.get(video.canonicalTopicId) : undefined) ??
      (video.canonicalSubjectId ? porDisciplina.get(video.canonicalSubjectId) : undefined);

    /*
      ⚠️ A LACUNA GANHA DE TUDO, e a separação de faixas é o que garante isso.

      Erro medido entra na faixa de 1.000 para cima; peso do edital, na de 100;
      o resto do acervo, abaixo. Somar tudo numa escala só deixaria um assunto
      de peso altíssimo passar na frente de uma lacuna real, e a cliente foi
      explícita: "considerar EXCLUSIVAMENTE as lacunas".
    */
    if (sinal?.errorPercent !== null && sinal?.errorPercent !== undefined) {
      return { ...video, score: 1_000 + sinal.errorPercent, reason: "lacuna" };
    }

    if (sinal?.weight != null && sinal.weight > 0) {
      return { ...video, score: 100 + (sinal.weight / maiorPeso) * 100, reason: "peso" };
    }

    return { ...video, score: 1, reason: "acervo" };
  });

  const agora = input.now.getTime();

  const ordenar = (lista: ScoredVideo[]) =>
    [...lista].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      /*
        Empate: o que ele nunca viu vem antes do que ele já viu há mais de um
        dia. Sem isto, um vídeo revisto ontem competiria de igual para igual
        com um inédito do mesmo assunto.
      */
      const vistoA = a.lastSeenAt?.getTime() ?? 0;
      const vistoB = b.lastSeenAt?.getTime() ?? 0;
      if (vistoA !== vistoB) return vistoA - vistoB;

      /* Desempate estável: sem ele a ordem muda sozinha entre aberturas. */
      return a.contentItemId < b.contentItemId ? -1 : 1;
    });

  const frescos = pontuados.filter((video) => {
    /* Visto há menos de 24 horas fica de fora da primeira leva. */
    if (!video.lastSeenAt) return true;
    return agora - video.lastSeenAt.getTime() >= cooldown;
  });

  /*
    ⚠️ OS JÁ VISTOS VOLTAM NO FIM, em vez de a tela dizer que acabou.

    Pedido da cliente em 08/09/2026: "queria que ao invés da mensagem avisando
    que não tem mais vídeos, pudesse voltar nos vídeos que já foram
    visualizados".

    Ela tem razão sobre o custo do estado vazio. O Mind-X abre no botão mais
    visível do aplicativo, e uma tela dizendo "não há vídeo para você" é o
    oposto do que aquele botão promete. Rever também não é desperdício aqui: são
    dicas de trinta segundos, e repetição é o mecanismo do produto inteiro.

    Eles entram DEPOIS, e na ordem do visto há mais tempo. O aluno percorre todo
    o inédito antes de reencontrar qualquer repetido, e o cooldown de 24 horas
    continua valendo para quem tem acervo de sobra.
  */
  const revistos = pontuados.filter((video) => !frescos.includes(video));

  return [...ordenar(frescos), ...ordenar(revistos)];
}
