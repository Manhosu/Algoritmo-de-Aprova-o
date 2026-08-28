import { boolean, index, integer, jsonb, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { users } from "./identity";

/**
 * Texto editável do site, versionado.
 *
 * POR QUE NO BANCO, E NÃO NO CÓDIGO
 * ----------------------------------------------------------------------------
 * A copy da página inicial é a peça que mais muda e a que menos depende de
 * programador: a cliente quer testar títulos, medir e trocar de novo. Enquanto
 * o texto morava no código, cada teste dela virava uma tarefa minha — e um
 * deploy.
 *
 * É a mesma decisão que o README já registra para os pesos dos motores e os
 * limites de plano: "valores calibráveis vivem no banco, versionados". Copy é
 * valor calibrável, e o mais calibrado de todos.
 *
 * POR QUE VERSIONADO, E NÃO UMA LINHA SOBRESCRITA
 * ----------------------------------------------------------------------------
 * ⚠️ Sobrescrever tornaria impossível responder "o que estava no ar quando a
 * conversão caiu?" — que é justamente a pergunta de quem testa copy. Cada
 * publicação cria uma linha nova e `is_current` aponta para a que vale; voltar
 * atrás é trocar o ponteiro, não recuperar um backup.
 *
 * Também é o que permite desfazer sem programador: a versão anterior continua
 * inteira no banco.
 */
export const siteContent = pgTable(
  "site_content",
  {
    id: primaryId(),

    /** Qual peça de texto. Hoje só `landing`; a coluna existe para a próxima. */
    key: varchar({ length: 40 }).notNull(),

    /** Sequencial por chave, começando em 1. */
    version: integer().notNull(),

    /**
     * A copy inteira, conferida contra `content/landing-schema.ts` ANTES de
     * chegar aqui. `jsonb` e não `text`: o formato é um objeto, e guardar como
     * string convidaria a gravar qualquer coisa.
     */
    content: jsonb().notNull(),

    /** Quem publicou. Nulo quando veio do seed, sem pessoa por trás. */
    publishedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),

    /** Anotação da própria autora: "testando título mais curto". */
    note: varchar({ length: 300 }),

    isCurrent: boolean().notNull().default(false),

    ...timestamps,
  },
  (table) => [
    uniqueIndex("site_content_key_version_unique").on(table.key, table.version),
    /** A leitura de toda página pública: a versão vigente daquela chave. */
    index("site_content_current_idx").on(table.key, table.isCurrent),
  ],
);
