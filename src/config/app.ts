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

/**
 * Contato de suporte.
 *
 * ⚠️ Endereço REAL, não um `contato@exemplo.com`. Rodapé com contato falso é
 * pior que rodapé sem contato: quem escreve e não recebe resposta conclui que a
 * empresa não existe.
 *
 * É a mesma conta que assina os e-mails da plataforma, então quem responder já
 * tem o histórico da pessoa à mão.
 */
export const SUPPORT_EMAIL = "oalgoritmodaaprovacao@gmail.com";

/**
 * Valor da opção "Outra banca" no seletor.
 *
 * ⚠️ NÃO É UM ID DE BANCA. As bancas cadastradas usam UUID; este marcador diz
 * "existe uma banca, mas não está na nossa lista". O servidor o traduz para
 * `examBoardId: null`, que é o que a coluna aceita.
 *
 * Sem ele, quem presta concurso de banca municipal precisava escolher uma
 * banca errada ou deixar em branco — e "em branco" significa "não sei", que é
 * outra coisa.
 */
export const OTHER_EXAM_BOARD = "__outra__";

/**
 * Comprimento mínimo da senha.
 *
 * ⚠️ MORA AQUI, E NÃO EM `server/auth/password.ts`, POR UM MOTIVO ESPECÍFICO:
 * aquele arquivo é `server-only`, então as telas não conseguem importar dele.
 * A regra ficava duplicada — o número no servidor e a frase "Pelo menos 10
 * caracteres" escrita à mão em TRÊS componentes de tela.
 *
 * Duplicada, ela sai de sincronia na primeira mudança, e o modo de falha é
 * cruel com o aluno: a tela promete um mínimo, o servidor recusa por outro, e
 * a mensagem de erro contradiz o texto que ele acabou de ler.
 *
 * Era 10. Passou a 8 a pedido da cliente (27/08/2026): ela propôs 6, que sai da
 * faixa recomendada pelo NIST para senha escolhida por pessoa; 8 é o piso do
 * NIST e foi o meio-termo aprovado.
 */
export const PASSWORD_MIN_LENGTH = 8;

/** O texto da regra na tela. Sai do mesmo número que o servidor aplica. */
export const PASSWORD_HINT = `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres. Uma frase é mais segura e mais fácil de lembrar.`;
