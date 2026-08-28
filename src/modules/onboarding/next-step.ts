/**
 * Qual é o próximo passo do aluno até o plano ficar de pé.
 *
 * POR QUE ISTO É UM MÓDULO, E NÃO UM `if` DENTRO DA HOME
 * ----------------------------------------------------------------------------
 * A Home sabia disso desde sempre. As outras telas não: quem clicava em
 * Cronograma antes de subir o edital via "seu cronograma aparece quando a
 * preparação estiver pronta" e um botão de volta para a Home. Dois saltos para
 * descobrir que faltava um PDF — e a cliente leu isso como link quebrado.
 *
 * Com a decisão num lugar só, qualquer tela responde a mesma coisa e manda para
 * o mesmo lugar. Duplicar a copy em quatro telas garantiria que uma delas ficasse
 * para trás na próxima mudança de fluxo.
 *
 * ⚠️ MÓDULO PURO: sem banco, sem React, sem `server-only`. Recebe o estado e
 * devolve texto e destino, o que o torna testável sem subir nada.
 */

/** O ícone é escolhido pela tela; aqui vai só o nome da intenção. */
export type NextStepIcon = "create" | "upload" | "review" | "diagnosis" | "processing";

export type NextStep = {
  title: string;
  body: string;
  href: string;
  cta: string | null;
  icon: NextStepIcon;
};

export type PreparationState = {
  id: string;
  status: "draft" | "extracting" | "review_pending" | "diagnosis_pending" | "active" | "archived" | "failed";
};

/**
 * Devolve `null` quando não há passo pendente — preparação ativa, com o plano
 * montado. Aí cada tela mostra o seu conteúdo de verdade.
 */
export function nextStep(preparation: PreparationState | null): NextStep | null {
  if (preparation === null) {
    return {
      title: "Comece pela sua preparação",
      body: "Diga qual concurso você vai prestar e envie o edital. É a partir dele que o algoritmo monta tudo.",
      href: "/preparacoes/nova",
      cta: "Criar minha preparação",
      icon: "create",
    };
  }

  switch (preparation.status) {
    case "draft":
      return {
        title: "Falta enviar o edital",
        body: "Sua preparação foi criada, mas ainda não recebeu o PDF do edital. É a partir dele que o plano é montado.",
        href: `/preparacoes/${preparation.id}/edital`,
        cta: "Enviar o edital",
        icon: "upload",
      };

    case "extracting":
      return {
        title: "Estamos lendo seu edital",
        body: "A IA está identificando as disciplinas e os assuntos. Costuma levar menos de um minuto.",
        href: `/preparacoes/${preparation.id}/edital`,
        // Sem botão: não há nada para ele fazer além de esperar, e um botão
        // aqui viraria um clique que não muda nada.
        cta: null,
        icon: "processing",
      };

    case "review_pending":
      return {
        title: "Confira o que a IA leu",
        body: "O conteúdo programático foi extraído do seu edital. Antes de continuar, corrija o que estiver errado e preencha os pesos que faltarem.",
        href: `/preparacoes/${preparation.id}/conteudo`,
        cta: "Revisar o conteúdo",
        icon: "review",
      };

    case "diagnosis_pending":
      return {
        title: "Falta o diagnóstico",
        body: "Diga o quanto você domina cada disciplina. São poucos cliques, e é o ponto de partida do algoritmo.",
        href: `/preparacoes/${preparation.id}/diagnostico`,
        cta: "Fazer o diagnóstico",
        icon: "diagnosis",
      };

    case "failed":
      return {
        title: "Não conseguimos ler seu edital",
        body: "A leitura do PDF falhou. Envie o arquivo de novo, de preferência a versão original do site da banca.",
        href: `/preparacoes/${preparation.id}/edital`,
        cta: "Enviar outro arquivo",
        icon: "upload",
      };

    /**
     * Encerrada conta como "sem preparação": o aluno precisa criar outra para
     * voltar a estudar, e mandá-lo para o edital de uma preparação arquivada
     * seria um beco.
     */
    case "archived":
      return {
        title: "Sua preparação está encerrada",
        body: "Crie uma nova preparação para voltar a estudar. O histórico da anterior continua guardado.",
        href: "/preparacoes",
        cta: "Ver minhas preparações",
        icon: "create",
      };

    case "active":
      return null;
  }
}
