import "server-only";

import { and, asc, eq, ne } from "drizzle-orm";

import { db } from "@/server/db";
import { examBoards } from "@/server/db/schema";

/**
 * A banca das questões que a própria plataforma escreve.
 *
 * Ela precisa existir na tabela porque toda questão aponta para uma banca, e as
 * autorais não vêm de concurso nenhum. Mas ela não é uma banca de concurso: o
 * aluno nunca vai prestar prova organizada por ela.
 */
const INTERNAL_BOARD_SLUG = "autoral";

export type SelectableBoard = {
  id: string;
  shortName: string;
  name: string;
};

/**
 * As bancas que o aluno pode escolher na preparação dele.
 *
 * ⚠️ TIRA A BANCA AUTORAL DA LISTA. Ela aparecia no topo do seletor, escrita
 * "Autoral — Autoral — Algoritmo da Aprovação", como se fosse uma banca que
 * organiza concurso. Era a primeira opção depois de "Não sei ainda", que é
 * justamente onde cai o clique de quem está com pressa.
 *
 * A regra mora aqui, e não em cada página, porque ela já tinha duas cópias — o
 * formulário de criação e a tela de dados da prova. Corrigir uma e esquecer a
 * outra é o modo natural de esse defeito voltar pela metade.
 */
export async function listSelectableBoards(): Promise<SelectableBoard[]> {
  return db
    .select({
      id: examBoards.id,
      shortName: examBoards.shortName,
      name: examBoards.name,
    })
    .from(examBoards)
    .where(and(eq(examBoards.isActive, true), ne(examBoards.slug, INTERNAL_BOARD_SLUG)))
    .orderBy(asc(examBoards.sortOrder), asc(examBoards.shortName));
}
