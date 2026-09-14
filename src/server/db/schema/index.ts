/**
 * Ponto único de entrada do schema.
 *
 * O `drizzle.config.ts` aponta para este arquivo: tabela que não for exportada
 * daqui NÃO entra na migration. Ao criar um módulo novo, acrescente o
 * `export *` correspondente — o esquecimento é silencioso.
 *
 * A ORDEM abaixo é a ordem de dependência entre os módulos e serve como mapa
 * do domínio para quem chega no projeto.
 */

/* Base ---------------------------------------------------------------------*/
export * from "./enums";

/* Quem acessa o sistema, com o que consentiu e o que pode fazer -------------*/
export * from "./identity";

/* O que o aluno paga e o que o plano dele libera ----------------------------*/
export * from "./billing";

/* A taxonomia única — a ponte entre o edital do aluno e o banco de questões --*/
export * from "./catalog";

/* Parâmetros versionados dos motores e a escada de níveis -------------------*/
export * from "./engine";

/* O edital do aluno: upload, extração por IA, conteúdo, diagnóstico, estado --*/
export * from "./preparation";

/* MOTOR 1 — a decisão de hoje ----------------------------------------------*/
export * from "./daily-task";

/* MOTOR 2 — o compromisso assumido no passado (independente do Motor 1) -----*/
export * from "./review";

/* A projeção até o dia da prova --------------------------------------------*/
export * from "./schedule";

/* Banco de questões, respostas com data e hora, limite diário por plano -----*/
export * from "./questions";

/* Estudo concluído e permanência real na plataforma ------------------------*/
export * from "./study";

/* XP, moedas, níveis, streak, conquistas, missões e loja (Marco 2) ----------*/
export * from "./gamification";

/* Flashcards, mapas mentais, videoaulas e trilhas (Marco 2) ----------------*/
export * from "./content";

/* Notificações e suporte (Marco 2) -----------------------------------------*/
export * from "./engagement";

/* Eventos, funil materializado e execução de jobs --------------------------*/
export * from "./analytics";

/* Texto do site editável pela cliente, versionado --------------------------*/
export * from "./site-content";

/* Jogos criados no Lovable e publicados pelo painel ------------------------*/
export * from "./games";
