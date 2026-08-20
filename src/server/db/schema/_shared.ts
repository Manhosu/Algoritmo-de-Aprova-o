import { timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Helpers reutilizados por todas as tabelas.
 *
 * DECISÕES QUE VALEM PARA O SCHEMA INTEIRO
 * ----------------------------------------------------------------------------
 * 1. CHAVE PRIMÁRIA = UUID
 *    Ids aparecem em URL (`/preparacoes/{id}`). Sequência inteira vazaria
 *    volume de negócio e permitiria enumerar registros de outros alunos.
 *    A exceção é `analytics_events`, que é append-only, nunca é exposta e usa
 *    `bigint identity` porque o ganho de localidade de índice importa no volume
 *    dela.
 *
 * 2. TIMESTAMP = SEMPRE `timestamptz`
 *    Nunca `timestamp` sem fuso. Guardamos o instante absoluto; a conversão
 *    para o fuso do aluno acontece na borda.
 *
 * 3. DATA CIVIL = COLUNA `date` SEPARADA, EM MODO STRING
 *    "Dia" no produto é o dia no fuso America/Sao_Paulo, não em UTC. Onde o
 *    conceito de dia importa (tarefa do dia, streak, gráfico diário, limite
 *    diário de questões, retenção D+1) existe uma coluna `date` gravada já
 *    convertida. Ela é lida como string "AAAA-MM-DD" para não passar por
 *    `Date` do JavaScript, que reintroduziria o fuso do servidor.
 *
 * 4. EXCLUSÃO É LÓGICA, NÃO FÍSICA
 *    `deletedAt` preserva integridade referencial do histórico. A remoção
 *    efetiva exigida pela LGPD acontece pela rotina de anonimização
 *    (ver `identity.ts` > users.anonymizedAt).
 */

export const primaryId = () => uuid().primaryKey().defaultRandom();

export const createdAt = () =>
  timestamp({ withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const deletedAt = () => timestamp({ withTimezone: true });

/** Bloco padrão de auditoria temporal. */
export const timestamps = {
  createdAt: createdAt(),
  updatedAt: updatedAt(),
};
