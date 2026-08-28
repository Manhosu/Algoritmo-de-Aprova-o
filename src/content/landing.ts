/* ==========================================================================
 *
 *   TEXTOS DA PÁGINA INICIAL — este arquivo é para editar
 *
 * ==========================================================================
 *
 * Tudo que o visitante lê na página inicial está aqui dentro, e só aqui. Para
 * trocar uma frase, troque o texto entre as aspas e salve. O site se atualiza
 * sozinho em dois ou três minutos.
 *
 * COMO EDITAR PELO GITHUB, SEM INSTALAR NADA
 * --------------------------------------------------------------------------
 *   1. Abra este arquivo no site do GitHub.
 *   2. Clique no lápis (ícone de editar), no canto superior direito.
 *   3. Mude o que quiser ENTRE AS ASPAS.
 *   4. Role até o fim e clique em "Commit changes".
 *
 * TRÊS REGRAS, E SÓ
 * --------------------------------------------------------------------------
 *   ✱ Mude só o que está entre aspas: "assim".
 *   ✱ Não apague as vírgulas do fim das linhas.
 *   ✱ Para usar aspas dentro de um texto, use as curvas: “assim”.
 *
 * Se algo for apagado por engano, o site NÃO publica a versão quebrada — ele
 * recusa a publicação e mantém a anterior no ar. Não dá para derrubar a página
 * editando aqui. Se acontecer, o GitHub mostra um ✗ vermelho no seu commit; é
 * só desfazer ou me chamar.
 *
 * ⚠️ O QUE NÃO ESTÁ AQUI: quantidade de blocos, ícones, cores e posição. Para
 * acrescentar um quinto passo ou trocar um ícone, me chame — mexer nisso pelo
 * texto quebraria o desenho da página.
 */

export const LANDING = {
  /* ------------------------------------------------------------------ *
   * O QUE APARECE NO GOOGLE E AO COMPARTILHAR O LINK
   * ------------------------------------------------------------------ */
  seo: {
    /** Título na aba do navegador e no resultado do Google. */
    title: "Estude o que importa, na ordem certa",
    /** Título grande no card do WhatsApp, Instagram e LinkedIn. */
    socialTitle: "Pare de decidir o que estudar. Comece a estudar.",
  },

  /* ------------------------------------------------------------------ *
   * PRIMEIRA DOBRA — o que aparece antes de rolar a página
   * ------------------------------------------------------------------ */
  hero: {
    /** Linha pequena em maiúsculas, acima do título. */
    eyebrow: "Para quem estuda para concurso",
    /** Primeira parte do título, em branco. */
    titleLine1: "Pare de decidir o que estudar.",
    /** Segunda parte, a que aparece em degradê azul. Mantenha curta. */
    titleLine2: "Comece a estudar.",
    /** Parágrafo abaixo do título. */
    subtitle:
      "Você sobe o edital do seu concurso. A partir dele, a plataforma monta seu plano de estudo e o reajusta a cada questão que você responde. Sem planilha, sem cronograma que envelhece na primeira semana.",
    /** Texto do botão principal, o azul. */
    primaryCta: "Começar agora, é grátis",
    /** Texto do botão secundário, que rola até "Como funciona". */
    secondaryCta: "Ver como funciona",
    /** Frase pequena embaixo dos botões. */
    note: "Não pedimos cartão para começar.",
  },

  /* ------------------------------------------------------------------ *
   * O PAINEL DE EXEMPLO — a "telinha" logo abaixo dos botões
   * ------------------------------------------------------------------ */
  mockup: {
    /** Título dentro do painel, em maiúsculas. */
    title: "Sua tarefa de hoje",
    /** Etiqueta no canto direito do painel. */
    badge: "1h disponível",
    /**
     * As quatro linhas do exemplo.
     *
     * `label` é a palavra em maiúsculas (Estude, Pratique, Revise) e `value` é
     * o assunto. `done: true` deixa a linha riscada, como já concluída.
     */
    tasks: [
      { label: "Estude", value: "Mapa Mental — Crase", done: true },
      { label: "Pratique", value: "Questões — Crase", done: true },
      { label: "Estude", value: "Concordância verbal", done: false },
      { label: "Revise", value: "Atos administrativos", done: false },
    ],
    /** Frase no rodapé do painel. */
    footnote:
      "Montada pelo algoritmo a partir do seu edital, do seu diagnóstico e do tempo que você tem hoje.",
  },

  /* ------------------------------------------------------------------ *
   * COMO FUNCIONA — os quatro passos
   * ------------------------------------------------------------------ */
  howItWorks: {
    eyebrow: "Como funciona",
    title: "Do PDF do edital à tarefa de hoje",
    subtitle:
      "Quatro passos, uma vez só. Depois disso o trabalho de decidir deixa de ser seu.",

    /**
     * ⚠️ A ORDEM DOS QUATRO IMPORTA e os nomes das chaves (`upload`, `review`,
     * `diagnosis`, `daily`) são o que liga cada texto ao seu ícone e à sua
     * largura na tela. Troque os textos à vontade; não troque os nomes.
     */
    steps: {
      upload: {
        title: "Você sobe o edital",
        body: "Um PDF. A IA lê o documento inteiro e organiza o conteúdo programático em disciplinas e assuntos.",
      },
      review: {
        title: "Você confere",
        body: "Corrige, acrescenta e remove o que quiser. Onde o edital informa o peso de cada tema, ele já vem preenchido.",
      },
      diagnosis: {
        title: "Faz o diagnóstico",
        body: "Marca o que domina e o que não domina. Leva poucos minutos e é o ponto de partida do algoritmo.",
      },
      daily: {
        title: "E abre o app todo dia",
        body: "A Tarefa do Dia já está pronta: o que estudar, com qual técnica e quais questões praticar.",
      },
    },
  },

  /* ------------------------------------------------------------------ *
   * O DIFERENCIAL — o bloco grande e os dois menores
   * ------------------------------------------------------------------ */
  differential: {
    eyebrow: "O diferencial",
    title: "Não é um banco de questões com cronograma em cima",
    subtitle:
      "As questões são o sensor, não o produto. O que a plataforma faz é decidir por você — e mudar de ideia quando os seus resultados mudam.",

    /** O bloco grande da esquerda, o argumento central. */
    engines: {
      title: "Dois motores, não um",
      body: "Um decide o que estudar hoje cruzando cinco sinais: seu desempenho, o peso no edital, a proximidade da prova, há quanto tempo você não vê o assunto e onde estão suas lacunas. O outro cuida das revisões, em trilho próprio.",
      /**
       * Os três números no rodapé do bloco. `value` é o número grande em azul,
       * `label` é a legenda cinza embaixo. Mantenha o `value` curto — ele tem
       * um terço da largura do bloco.
       */
      metrics: [
        { value: "5", label: "sinais de priorização" },
        { value: "24h→90d", label: "ciclo de revisão" },
        { value: "1", label: "decisão por dia" },
      ],
    },

    /** Os dois blocos menores da direita. Os nomes das chaves ligam ao ícone. */
    cards: {
      review: {
        title: "Revisão que não depende da sua memória",
        body: "Todo conteúdo estudado volta em 24 horas, 7, 30, 60 e 90 dias. Se você atrasar, ela não some — acumula, e o intervalo seguinte conta do dia em que você realmente revisou.",
      },
      schedule: {
        title: "Cronograma que se refaz sozinho",
        body: "Ele muda quando você responde questões ou conclui um estudo. E avisa quando o conteúdo que falta não cabe no tempo que você tem até a prova.",
      },
    },
  },

  /* ------------------------------------------------------------------ *
   * ENCERRAMENTO — o último bloco, centralizado
   * ------------------------------------------------------------------ */
  closing: {
    title: "Sua próxima sessão de estudo já está decidida.",
    cta: "Criar minha conta grátis",
    note: "Leva menos de um minuto. Você pode apagar sua conta quando quiser.",
  },

  /* ------------------------------------------------------------------ *
   * BOTÃO FIXO DO CELULAR — aparece ao rolar, colado no rodapé
   * ------------------------------------------------------------------ */
  stickyCta: {
    label: "Começar agora, é grátis",
    /** Frase minúscula embaixo. Mantenha bem curta: é uma linha só. */
    note: "Não pedimos cartão.",
  },
} as const;
