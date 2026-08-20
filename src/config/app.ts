/**
 * Constantes de identidade da aplicação.
 *
 * ATENÇÃO: aqui só entram valores que NUNCA mudam sem deploy (nome, tagline,
 * fuso). Valores de negócio calibráveis — pesos do motor, XP por atividade,
 * limites de plano — vivem no BANCO, versionados, e são editáveis pelo painel
 * administrativo (README 2.6). Não mova nada disso para cá.
 */

export const APP_NAME = "O Algoritmo da Aprovação";

export const APP_TAGLINE =
  "Disciplina hoje. Consistência sempre. Resultados são consequência!";

export const APP_DESCRIPTION =
  "Suba o edital, a IA estrutura o conteúdo e o algoritmo monta seu plano de " +
  "estudo — e o reajusta conforme o seu desempenho real.";

/**
 * Fuso horário canônico do produto.
 *
 * Toda fronteira de "dia" do sistema usa este fuso, nunca UTC nem o fuso do
 * navegador. Isso é o que faz a Tarefa do Dia virar à meia-noite de Brasília,
 * o streak não quebrar sozinho, a retenção D+1 do funil bater com a realidade
 * e o "Horário de Ouro" apontar o horário que o aluno de fato estudou.
 */
export const APP_TIMEZONE = "America/Sao_Paulo";

export const APP_LOCALE = "pt-BR";
