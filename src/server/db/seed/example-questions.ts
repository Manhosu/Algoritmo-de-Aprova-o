import type { ParsedQuestion } from "@/server/import/questions";

/**
 * Questões de EXEMPLO, para testar os filtros.
 *
 * ⚠️ Estas questões NÃO são o acervo. O acervo real é a planilha autoral da
 * cliente, que hoje traz 95 questões — mas todas de uma única banca, uma única
 * disciplina e um único assunto (Crase). Com uma combinação só, não há o que
 * filtrar, e o item 11 do checklist de aceite do Marco 1 ficaria sem como ser
 * verificado.
 *
 * Estas cobrem 4 disciplinas × 5 bancas × 3 níveis de dificuldade, que é o
 * mínimo para exercitar cada filtro de verdade.
 *
 * Entram num lote de importação próprio (`question_import_batches`), então
 * somem com um comando quando o acervo real chegar:
 *
 *     delete from questions where import_batch_id = '<id do lote de exemplos>';
 */

type Example = Omit<ParsedQuestion, "sourceRow" | "options" | "topicNames"> & {
  answer: "A" | "B" | "C" | "D" | "E";
  alternatives: [string, string, string, string, string];
};

const EXAMPLES: Example[] = [
  /* ---------------------------------------------------- Direito Administrativo */
  {
    examBoardName: "Cebraspe (CESPE)",
    subjectName: "Direito Administrativo",
    topicName: "Princípios da Administração Pública",
    difficulty: "medium",
    statement:
      "Uma autarquia federal identificou, em auditoria interna, que um ato de concessão de adicional havia sido praticado com vício de legalidade. Sem provocação de qualquer interessado, a própria autarquia anulou o ato. Assinale a alternativa que indica o princípio que fundamenta essa atuação.",
    alternatives: [
      "Autotutela, que permite à Administração rever os próprios atos, anulando os ilegais e revogando os inconvenientes.",
      "Tutela, que autoriza a Administração direta a rever atos das entidades da Administração indireta.",
      "Especialidade, que vincula a entidade administrativa às finalidades para as quais foi criada.",
      "Continuidade, que impede a interrupção da prestação dos serviços públicos essenciais.",
      "Hierarquia, que permite ao superior rever os atos praticados por seus subordinados.",
    ],
    answer: "A",
    explanation:
      "A alternativa A está correta. A autotutela é a prerrogativa de a própria Administração rever seus atos, independentemente de provocação — anulando os ilegais e revogando os inoportunos (Súmulas 346 e 473 do STF). B descreve o controle finalístico exercido pela Administração direta sobre a indireta, que não é o caso, pois quem anulou foi a própria autarquia. C trata da vinculação da entidade à sua finalidade legal. D diz respeito à prestação de serviços, não à revisão de atos. E existe, mas pressupõe relação de subordinação entre órgãos, e o enunciado descreve a entidade agindo sobre ato próprio.",
  },
  {
    examBoardName: "Fundação Getulio Vargas",
    subjectName: "Direito Administrativo",
    topicName: "Princípios da Administração Pública",
    difficulty: "easy",
    statement:
      "O caput do art. 37 da Constituição Federal relaciona os princípios que devem ser observados pela Administração Pública direta e indireta de qualquer dos Poderes da União, dos Estados, do Distrito Federal e dos Municípios. Assinale a alternativa que contém apenas princípios ali expressos.",
    alternatives: [
      "Legalidade, impessoalidade, moralidade, publicidade e eficiência.",
      "Legalidade, impessoalidade, razoabilidade, publicidade e eficiência.",
      "Legalidade, supremacia do interesse público, moralidade, publicidade e eficiência.",
      "Legalidade, impessoalidade, moralidade, proporcionalidade e eficiência.",
      "Legalidade, impessoalidade, moralidade, publicidade e autotutela.",
    ],
    answer: "A",
    explanation:
      "A alternativa A está correta e reproduz exatamente o rol do art. 37, caput, conhecido pela sigla LIMPE. As demais trocam um dos cinco por um princípio que, embora aplicável à Administração, é implícito ou decorre de outra norma: razoabilidade (B), supremacia do interesse público (C), proporcionalidade (D) e autotutela (E) não constam do caput do art. 37.",
  },
  {
    examBoardName: "Fundação Carlos Chagas",
    subjectName: "Direito Administrativo",
    topicName: "Atos administrativos",
    difficulty: "hard",
    statement:
      "Um órgão municipal determinou a interdição imediata de um estabelecimento comercial que oferecia risco iminente à saúde pública, sem recorrer previamente ao Poder Judiciário. Sobre o atributo do ato administrativo que autoriza essa atuação, assinale a alternativa correta.",
    alternatives: [
      "Trata-se da presunção de legitimidade, que dispensa a Administração de comprovar os fatos que alega.",
      "Trata-se da autoexecutoriedade, que permite executar o ato diretamente, sem autorização judicial prévia, quando há previsão legal ou situação de urgência.",
      "Trata-se da imperatividade, que torna o ato obrigatório independentemente da concordância do destinatário.",
      "Trata-se da tipicidade, que exige que o ato corresponda a figura definida em lei.",
      "Trata-se da discricionariedade, que confere ao agente liberdade de escolha quanto ao conteúdo do ato.",
    ],
    answer: "B",
    explanation:
      "A alternativa B está correta. A autoexecutoriedade permite que a Administração execute materialmente suas decisões sem prévia autorização judicial, e é admitida quando há previsão legal ou quando a urgência exige — exatamente o caso da interdição por risco iminente. A distinção fina está entre B e C: a imperatividade faz o ato ser obrigatório para o particular, mas obrigar não é o mesmo que EXECUTAR; a execução material sem juiz é a autoexecutoriedade. A confunde presunção de legitimidade com dispensa de prova, quando na verdade ela apenas inverte o ônus. D descreve atributo diverso, ligado à correspondência com figura legal. E não é atributo do ato, e sim característica do poder que o embasa.",
  },
  {
    examBoardName: "IBFC",
    subjectName: "Direito Administrativo",
    topicName: "Licitações e contratos",
    difficulty: "easy",
    statement:
      "A Lei nº 14.133/2021 estabelece modalidades de licitação para a contratação de bens, serviços e obras pela Administração Pública. Assinale a alternativa que apresenta uma modalidade prevista nessa lei.",
    alternatives: [
      "Tomada de preços.",
      "Convite.",
      "Diálogo competitivo.",
      "Carta-convite simplificada.",
      "Pregão presencial obrigatório.",
    ],
    answer: "C",
    explanation:
      "A alternativa C está correta. O diálogo competitivo é modalidade introduzida pela Lei nº 14.133/2021, voltada a contratações de inovação técnica ou tecnológica. A e B eram modalidades da Lei nº 8.666/1993 e foram extintas pela nova lei — são os distratores mais prováveis para quem estudou pela legislação anterior. D e E não existem como modalidades: a primeira é nome inventado e a segunda confunde modalidade com forma de realização, já que o pregão na nova lei é preferencialmente eletrônico.",
  },

  /* --------------------------------------------------- Direito Constitucional */
  {
    examBoardName: "Cebraspe (CESPE)",
    subjectName: "Direito Constitucional",
    topicName: "Direitos e garantias fundamentais",
    difficulty: "easy",
    statement:
      "Um cidadão deseja obter informações a seu respeito constantes de banco de dados de entidade governamental e, após negativa administrativa, pretende recorrer ao Judiciário. Assinale a alternativa que indica o remédio constitucional adequado.",
    alternatives: [
      "Habeas corpus.",
      "Habeas data.",
      "Mandado de injunção.",
      "Ação popular.",
      "Mandado de segurança coletivo.",
    ],
    answer: "B",
    explanation:
      "A alternativa B está correta. O habeas data (art. 5º, LXXII) assegura o conhecimento e a retificação de informações relativas à pessoa do impetrante constantes de registros de entidades governamentais ou de caráter público. A protege a liberdade de locomoção. C serve à falta de norma regulamentadora que inviabilize o exercício de direito constitucional. D visa anular ato lesivo ao patrimônio público. E protege direito líquido e certo de coletividade, e não o acesso a dados pessoais do próprio impetrante — é o distrator mais plausível para quem lembra do mandado de segurança mas não da especialidade do habeas data.",
  },
  {
    examBoardName: "Fundação Getulio Vargas",
    subjectName: "Direito Constitucional",
    topicName: "Direitos e garantias fundamentais",
    difficulty: "medium",
    statement:
      "O art. 6º da Constituição Federal enumera os direitos sociais. Assinale a alternativa que apresenta apenas direitos ali expressamente previstos.",
    alternatives: [
      "Educação, saúde, alimentação e trabalho.",
      "Educação, saúde, propriedade e trabalho.",
      "Educação, saúde, trabalho e livre iniciativa.",
      "Saúde, moradia, trabalho e devido processo legal.",
      "Saúde, lazer, trabalho e liberdade de associação.",
    ],
    answer: "A",
    explanation:
      "A alternativa A está correta: educação, saúde, alimentação e trabalho constam expressamente do art. 6º. Os distratores exploram uma confusão comum e específica — misturar direitos SOCIAIS (art. 6º) com direitos INDIVIDUAIS (art. 5º) ou com princípios da ordem econômica (art. 170). Propriedade (B) e liberdade de associação (E) são individuais; livre iniciativa (C) é fundamento da ordem econômica; devido processo legal (D) é garantia processual individual.",
  },
  {
    examBoardName: "Fundação Carlos Chagas",
    subjectName: "Direito Constitucional",
    topicName: "Organização dos Poderes",
    difficulty: "medium",
    statement:
      "Um projeto de lei que dispõe sobre o aumento de remuneração dos servidores de um órgão do Poder Executivo federal foi apresentado por um deputado federal. Sobre a regularidade dessa iniciativa, assinale a alternativa correta.",
    alternatives: [
      "A iniciativa é regular, pois qualquer parlamentar pode propor lei sobre matéria remuneratória.",
      "A iniciativa é irregular, pois se trata de matéria de iniciativa privativa do Presidente da República.",
      "A iniciativa é regular, desde que o projeto seja subscrito por um terço dos membros da Câmara.",
      "A iniciativa é irregular, pois a matéria só pode ser tratada por medida provisória.",
      "A iniciativa é regular, pois a reserva de iniciativa alcança apenas a criação de cargos, não a remuneração.",
    ],
    answer: "B",
    explanation:
      "A alternativa B está correta. O art. 61, § 1º, II, 'a', da Constituição reserva ao Presidente da República a iniciativa de leis que disponham sobre aumento de remuneração de servidores da Administração federal — vício de iniciativa que não se convalida nem com sanção presidencial posterior. A ignora a reserva. C inventa um requisito de subscrição inexistente para essa hipótese. D é incorreta porque medida provisória não é o único veículo, e há vedação de MP para determinadas matérias. E erra ao restringir a reserva à criação de cargos: o dispositivo alcança expressamente também a remuneração.",
  },

  /* ------------------------------------------------------- Raciocínio Lógico */
  {
    examBoardName: "Cebraspe (CESPE)",
    subjectName: "Raciocínio Lógico",
    topicName: "Equivalências e negações",
    difficulty: "medium",
    statement:
      "Considere a proposição: 'Se o relatório for aprovado, então o pagamento será liberado.' Assinale a alternativa que apresenta a negação dessa proposição.",
    alternatives: [
      "Se o relatório não for aprovado, então o pagamento não será liberado.",
      "O relatório não foi aprovado ou o pagamento será liberado.",
      "O relatório foi aprovado e o pagamento não será liberado.",
      "Se o pagamento não for liberado, então o relatório não foi aprovado.",
      "O relatório não foi aprovado e o pagamento não será liberado.",
    ],
    answer: "C",
    explanation:
      "A alternativa C está correta. A negação de uma condicional 'se P então Q' é 'P e não Q' — a única situação em que a condicional é falsa. A apresenta a inversa, que não é equivalente nem negação. B é a própria condicional reescrita como disjunção ('não P ou Q'), ou seja, é equivalente à proposição original, não sua negação — é o distrator mais perigoso, porque quem decorou a equivalência sem entendê-la escolhe esta. D é a contrapositiva, também equivalente à original. E nega as duas partes, o que não corresponde a nenhuma regra de negação de condicional.",
  },
  {
    examBoardName: "Fundação Getulio Vargas",
    subjectName: "Raciocínio Lógico",
    topicName: "Proposições e conectivos",
    difficulty: "easy",
    statement:
      "Em uma reunião, foi registrada a seguinte afirmação: 'O contrato foi assinado ou a proposta foi arquivada.' Sabendo que o conectivo 'ou' é aqui empregado em sentido inclusivo, assinale a alternativa que apresenta uma situação em que a afirmação é FALSA.",
    alternatives: [
      "O contrato foi assinado e a proposta foi arquivada.",
      "O contrato foi assinado e a proposta não foi arquivada.",
      "O contrato não foi assinado e a proposta foi arquivada.",
      "O contrato não foi assinado e a proposta não foi arquivada.",
      "A afirmação é verdadeira em qualquer das situações acima.",
    ],
    answer: "D",
    explanation:
      "A alternativa D está correta. A disjunção inclusiva é falsa em um único caso: quando ambas as parcelas são falsas. Em A, B e C ao menos uma parcela é verdadeira, o que torna a disjunção verdadeira — em A as duas são, e é justamente por isso que o distrator A atrai quem confunde 'ou' inclusivo com 'ou' exclusivo. E é incorreta porque existe, sim, uma situação de falsidade.",
  },
  {
    examBoardName: "Fundação Carlos Chagas",
    subjectName: "Raciocínio Lógico",
    topicName: "Análise combinatória",
    difficulty: "hard",
    statement:
      "Uma equipe deve organizar em fila, para uma fotografia, seis pastas de arquivo: três pastas azuis idênticas entre si, duas pastas verdes idênticas entre si e uma pasta vermelha. Assinale a alternativa que indica quantas filas distintas podem ser formadas.",
    alternatives: ["720", "120", "60", "30", "20"],
    answer: "C",
    explanation:
      "A alternativa C está correta. Trata-se de permutação com elementos repetidos: 6! dividido pelo produto dos fatoriais das repetições, ou seja, 720 / (3! × 2! × 1!) = 720 / 12 = 60. A alternativa A é o resultado de tratar todas as pastas como distintas (6! = 720), o erro mais comum. B corresponde a dividir apenas por 3!. D e E resultam de dividir por fatores maiores que os devidos, como 4! ou 6!, o que indica confusão sobre quais elementos se repetem.",
  },
  {
    examBoardName: "VUNESP",
    subjectName: "Raciocínio Lógico",
    topicName: "Probabilidade",
    difficulty: "medium",
    statement:
      "Em um setor com 10 processos, 4 estão com pendência documental. Escolhendo-se aleatoriamente 2 processos, um após o outro e sem reposição, assinale a alternativa que indica a probabilidade de ambos apresentarem pendência.",
    alternatives: ["2/15", "4/25", "1/5", "3/20", "2/5"],
    answer: "A",
    explanation:
      "A alternativa A está correta. Sem reposição, a probabilidade é (4/10) × (3/9) = 12/90 = 2/15. A alternativa B corresponde a calcular com reposição — (4/10) × (4/10) = 16/100 = 4/25 —, que é o erro conceitual mais frequente aqui e por isso o distrator mais forte. C, D e E resultam de somar as probabilidades em vez de multiplicá-las ou de trocar o total de processos ao longo do cálculo.",
  },

  /* ------------------------------------------------------- Língua Portuguesa */
  {
    examBoardName: "VUNESP",
    subjectName: "Língua Portuguesa",
    topicName: "Concordância verbal e nominal",
    difficulty: "medium",
    statement:
      "Uma editora revisou um relatório interno antes da publicação. Assinale a alternativa em que a concordância está de acordo com a norma-padrão da língua.",
    alternatives: [
      "Fazem cinco anos que a editora publica o relatório anual.",
      "Faz cinco anos que a editora publica o relatório anual.",
      "Fazem cinco anos, e a editora ainda publicam o relatório anual.",
      "Havia muitos anos que a editora publicavam o relatório anual.",
      "Existe, no arquivo, diversos relatórios antigos da editora.",
    ],
    answer: "B",
    explanation:
      "A alternativa B está correta. O verbo 'fazer' indicando tempo decorrido é impessoal e fica sempre na terceira pessoa do singular: 'Faz cinco anos'. A flexiona o verbo impessoal, erro clássico. C acumula dois problemas: flexiona 'fazer' impessoal e faz 'editora' concordar com verbo no plural. D erra ao flexionar 'publicavam' com sujeito singular, embora acerte a impessoalidade de 'havia'. E erra porque 'existir' não é impessoal e deve concordar com 'diversos relatórios', exigindo 'Existem' — é o distrator que separa quem decorou a regra de 'haver' de quem entendeu que ela não se estende a 'existir'.",
  },
];

export function buildExampleQuestions(): ParsedQuestion[] {
  return EXAMPLES.map((example, index) => ({
    sourceRow: index + 1,
    examBoardName: example.examBoardName,
    subjectName: example.subjectName,
    topicName: example.topicName,
    /* Exemplo do seed cobre um assunto só. Ver a nota em `questionTopics`. */
    topicNames: [example.topicName],
    difficulty: example.difficulty,
    statement: example.statement,
    explanation: example.explanation,
    options: example.alternatives.map((content, i) => ({
      label: ["A", "B", "C", "D", "E"][i],
      content,
      isCorrect: ["A", "B", "C", "D", "E"][i] === example.answer,
    })),
  }));
}
