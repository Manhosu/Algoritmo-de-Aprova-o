import { boolean, index, integer, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";

import { primaryId, timestamps } from "./_shared";
import { plans } from "./billing";
import { users } from "./identity";

/**
 * JOGOS CADASTRADOS PELA CLIENTE.
 * ============================================================================
 *
 * Pedido dela em 14/09/2026: "gostei bastante de criar os jogos no site
 * lovable e pretendo criar outros. Então, penso que seria melhor se você criar
 * o botão Jogos no menu lateral e que no Painel Administrativo eu pudesse subir
 * os jogos criados na plataforma, com campo para Nome do jogo / Breve descrição
 * / Imagem ilustrativa / Link do jogo / Plano".
 *
 * O jogo em si mora no Lovable. Aqui fica o cartão dele e a regra de quem pode
 * abrir; a página do jogo o mostra dentro do site, numa janela com botão de
 * tela cheia, do jeito que o mapa mental abre.
 */
export const games = pgTable(
  "games",
  {
    id: primaryId(),
    title: varchar({ length: 120 }).notNull(),
    description: text(),
    /** Caminho no bucket, como a imagem dos itens da Loja. */
    imageStoragePath: text(),
    /** O endereço do jogo publicado. Só `https://*.lovable.app` — ver `validarLinkDoJogo`. */
    gameUrl: text().notNull(),
    /**
     * O plano mínimo para jogar: quem está nele ou num plano acima abre o jogo.
     * NULO = liberado para todos, inclusive o gratuito.
     */
    minPlanId: uuid().references(() => plans.id, { onDelete: "set null" }),
    isPublished: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => [index("games_published_idx").on(table.isPublished, table.sortOrder)],
);
