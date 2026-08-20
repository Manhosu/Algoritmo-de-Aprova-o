/**
 * Catálogo canônico inicial.
 *
 * ⚠️ ISTO NÃO É UM CATÁLOGO COMPLETO, e não deve ser confundido com um.
 *
 * É a semente: as disciplinas que aparecem no mockup da Home, com uma árvore de
 * assuntos suficiente para o casamento de taxonomia ter alvos reais e para os
 * filtros terem o que filtrar. O catálogo de verdade cresce por dois caminhos,
 * nenhum deles sendo este arquivo:
 *
 *   1. o administrador cadastra assuntos pelo painel;
 *   2. a fila de não mapeados (`topic_mapping_queue`) revela o que falta —
 *      cada item resolvido vira um sinônimo e o casamento melhora sozinho.
 *
 * Os SINÔNIMOS abaixo importam mais do que parecem: são as redações
 * alternativas que aparecem em edital de verdade. Cada um deles é um item que o
 * aluno NÃO vai ver cair na fila.
 */

export type SeedTopic = {
  name: string;
  aliases?: string[];
  children?: SeedTopic[];
};

export type SeedSubject = {
  name: string;
  icon: string;
  aliases?: string[];
  topics: SeedTopic[];
};

export const SEED_SUBJECTS: SeedSubject[] = [
  {
    name: "Língua Portuguesa",
    icon: "book-open",
    aliases: ["Português", "Portugues", "Língua Portuguesa e Interpretação de Textos"],
    topics: [
      {
        name: "Crase",
        aliases: [
          "Emprego do sinal indicativo de crase",
          "Uso da crase",
          "Acento grave",
          "Sinal indicativo de crase",
          "Emprego do acento grave",
        ],
        children: [
          { name: "Fusão de preposição com artigo" },
          { name: "Crase em locuções adverbiais" },
          { name: "Crase em locuções prepositivas" },
          { name: "Crase antes de pronomes" },
          { name: "Crase em nomes de lugares" },
          { name: "Crase em indicação de horas" },
          { name: "Casos proibidos de crase" },
          { name: "Casos facultativos de crase" },
        ],
      },
      {
        name: "Concordância verbal e nominal",
        aliases: ["Concordância", "Concordancia verbal", "Concordancia nominal"],
      },
      {
        name: "Regência verbal e nominal",
        aliases: ["Regência", "Regencia verbal", "Regencia nominal"],
      },
      { name: "Acentuação gráfica", aliases: ["Acentuação", "Acentuacao grafica"] },
      { name: "Pontuação", aliases: ["Emprego dos sinais de pontuação"] },
      { name: "Colocação pronominal", aliases: ["Próclise, mesóclise e ênclise"] },
      {
        name: "Interpretação de texto",
        aliases: ["Compreensão e interpretação de textos", "Compreensão textual"],
      },
      { name: "Ortografia", aliases: ["Ortografia oficial"] },
      { name: "Classes de palavras", aliases: ["Morfologia"] },
      { name: "Sintaxe do período", aliases: ["Oração e período", "Análise sintática"] },
    ],
  },
  {
    name: "Direito Administrativo",
    icon: "landmark",
    aliases: ["Dir. Administrativo", "Noções de Direito Administrativo"],
    topics: [
      {
        name: "Princípios da Administração Pública",
        aliases: [
          "Princípios administrativos",
          "Princípios expressos e implícitos da Administração",
          "LIMPE",
        ],
      },
      { name: "Atos administrativos", aliases: ["Ato administrativo", "Atos da Administração"] },
      { name: "Poderes administrativos", aliases: ["Poderes da Administração Pública"] },
      { name: "Licitações e contratos", aliases: ["Lei 14.133/2021", "Licitação"] },
      { name: "Agentes públicos", aliases: ["Servidores públicos", "Regime jurídico"] },
      { name: "Improbidade administrativa", aliases: ["Lei 8.429/1992"] },
      { name: "Organização administrativa", aliases: ["Administração direta e indireta"] },
      { name: "Responsabilidade civil do Estado" },
      { name: "Controle da Administração Pública" },
    ],
  },
  {
    name: "Direito Constitucional",
    icon: "scale",
    aliases: ["Dir. Constitucional", "Noções de Direito Constitucional"],
    topics: [
      {
        name: "Direitos e garantias fundamentais",
        aliases: [
          "Direitos fundamentais",
          "Constituição - Arts. 5º ao 17",
          "Dos direitos e deveres individuais e coletivos",
        ],
      },
      { name: "Organização do Estado", aliases: ["Da organização do Estado"] },
      { name: "Organização dos Poderes", aliases: ["Poder Legislativo, Executivo e Judiciário"] },
      { name: "Administração Pública na Constituição", aliases: ["Art. 37 da CF"] },
      { name: "Controle de constitucionalidade" },
      { name: "Princípios fundamentais", aliases: ["Dos princípios fundamentais"] },
      { name: "Ordem social" },
    ],
  },
  {
    name: "Raciocínio Lógico",
    icon: "puzzle",
    aliases: ["Raciocínio Lógico-Matemático", "Lógica", "RLM"],
    topics: [
      { name: "Proposições e conectivos", aliases: ["Lógica proposicional", "Conectivos lógicos"] },
      { name: "Tabelas-verdade", aliases: ["Tabela verdade"] },
      { name: "Equivalências e negações", aliases: ["Equivalências lógicas", "Negação de proposições"] },
      { name: "Argumentação e silogismos", aliases: ["Argumentos lógicos", "Silogismo"] },
      { name: "Análise combinatória", aliases: ["Combinatória", "Princípio fundamental da contagem"] },
      { name: "Probabilidade" },
      { name: "Sequências e padrões", aliases: ["Sequências lógicas"] },
    ],
  },
  {
    name: "Matemática",
    icon: "calculator",
    aliases: ["Matemática Básica", "Noções de Matemática"],
    topics: [
      { name: "Razão e proporção", aliases: ["Razões e proporções", "Regra de três"] },
      { name: "Porcentagem" },
      { name: "Juros simples e compostos", aliases: ["Matemática financeira", "Juros"] },
      { name: "Conjuntos numéricos", aliases: ["Números e operações"] },
      { name: "Equações e sistemas", aliases: ["Equações do 1º e 2º grau"] },
      { name: "Grandezas proporcionais" },
    ],
  },
  {
    name: "Informática",
    icon: "monitor",
    aliases: ["Noções de Informática", "Informática Básica"],
    topics: [
      { name: "Sistemas operacionais", aliases: ["Windows", "Linux"] },
      { name: "Editores de texto e planilhas", aliases: ["Pacote Office", "LibreOffice", "Microsoft Office"] },
      { name: "Internet e correio eletrônico", aliases: ["Navegadores", "E-mail"] },
      { name: "Segurança da informação", aliases: ["Noções de segurança"] },
      { name: "Redes de computadores" },
    ],
  },
  {
    name: "Legislação",
    icon: "file-text",
    aliases: ["Legislação Específica", "Legislação Aplicada"],
    topics: [
      { name: "Lei nº 8.112/1990", aliases: ["Regime Jurídico Único", "Estatuto do Servidor"] },
      { name: "Lei nº 9.784/1999", aliases: ["Processo administrativo federal"] },
      { name: "Lei nº 12.527/2011", aliases: ["Lei de Acesso à Informação", "LAI"] },
      { name: "Lei nº 13.709/2018", aliases: ["LGPD", "Lei Geral de Proteção de Dados"] },
      { name: "Código de Ética do Servidor Público" },
    ],
  },
];

/**
 * Bancas organizadoras.
 *
 * A primeira é especial: as questões autorais da plataforma não vêm de banca
 * nenhuma, mas o filtro precisa de um rótulo para elas — e o aluno precisa
 * saber que aquela questão é da casa, não de um concurso passado.
 */
export const SEED_EXAM_BOARDS: Array<{
  name: string;
  shortName: string;
  slug: string;
  sortOrder: number;
}> = [
  { name: "Autoral — Algoritmo da Aprovação", shortName: "Autoral", slug: "autoral", sortOrder: 0 },
  { name: "Cebraspe (CESPE)", shortName: "Cebraspe", slug: "cebraspe", sortOrder: 1 },
  { name: "Fundação Getulio Vargas", shortName: "FGV", slug: "fgv", sortOrder: 2 },
  { name: "Fundação Carlos Chagas", shortName: "FCC", slug: "fcc", sortOrder: 3 },
  { name: "VUNESP", shortName: "VUNESP", slug: "vunesp", sortOrder: 4 },
  { name: "Instituto AOCP", shortName: "AOCP", slug: "aocp", sortOrder: 5 },
  { name: "IBFC", shortName: "IBFC", slug: "ibfc", sortOrder: 6 },
  { name: "Instituto Quadrix", shortName: "Quadrix", slug: "quadrix", sortOrder: 7 },
  { name: "Fundatec", shortName: "Fundatec", slug: "fundatec", sortOrder: 8 },
];

/** Nome exato que a planilha da cliente usa na coluna "Banca". */
export const AUTHORIAL_BOARD_NAME = "Algoritmo da Aprovação";
export const AUTHORIAL_BOARD_SLUG = "autoral";
