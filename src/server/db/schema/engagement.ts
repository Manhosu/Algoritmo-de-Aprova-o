import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, primaryId, timestamps } from "./_shared";
import {
  notificationTypeEnum,
  supportTicketCategoryEnum,
  supportTicketStatusEnum,
} from "./enums";
import { users } from "./identity";

/* ==========================================================================
 * NOTIFICAÇÕES E SUPORTE (MARCO 2)
 *
 * Escopo deliberadamente mínimo: o README lista "🔔 Notificações" e
 * "💬 Feedback & Suporte" como itens do menu do avatar (2.2) e o sino no
 * header (2.1), mas não especifica um módulo de atendimento. Modelamos o
 * suficiente para os itens do menu existirem de verdade e nada além disso —
 * inventar um helpdesk aqui seria escopo que ninguém pediu.
 * ========================================================================== */

export const notifications = pgTable(
  "notifications",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    type: notificationTypeEnum().notNull(),
    title: varchar({ length: 200 }).notNull(),
    body: text(),
    actionUrl: text(),

    readAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    /** A consulta do sino: não lidas, mais recentes primeiro. */
    index("notifications_user_unread_idx").on(table.userId, table.readAt, table.createdAt),
  ],
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    category: supportTicketCategoryEnum().notNull().default("other"),
    subject: varchar({ length: 200 }).notNull(),
    message: text().notNull(),
    status: supportTicketStatusEnum().notNull().default("open"),

    /** Tela onde o aluno estava — poupa uma ida e volta no atendimento. */
    contextPath: varchar({ length: 300 }),

    respondedAt: timestamp({ withTimezone: true }),
    respondedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    response: text(),
    resolvedAt: timestamp({ withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    index("support_tickets_status_idx").on(table.status, table.createdAt),
    index("support_tickets_user_idx").on(table.userId),
  ],
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const supportTicketsRelations = relations(supportTickets, ({ one }) => ({
  user: one(users, { fields: [supportTickets.userId], references: [users.id] }),
}));
