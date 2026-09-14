import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { podeJogar, validarLinkDoJogo } from "@/modules/games/rules";
import { db } from "@/server/db";
import { games, plans, subscriptions } from "@/server/db/schema";
import { signContentUrls } from "@/server/storage";

/**
 * JOGOS — leitura para o aluno e cadastro pelo painel. Regras em
 * `modules/games/rules`.
 */

/** A ordem do plano ativo do aluno, para comparar com o plano mínimo do jogo. */
async function ordemDoPlanoDoAluno(userId: string): Promise<number | null> {
  const [linha] = await db
    .select({ ordem: plans.sortOrder })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .limit(1);

  return linha?.ordem ?? null;
}

const colunasDoJogo = {
  id: games.id,
  title: games.title,
  description: games.description,
  imageStoragePath: games.imageStoragePath,
  gameUrl: games.gameUrl,
  minPlanId: games.minPlanId,
  isPublished: games.isPublished,
  sortOrder: games.sortOrder,
  minPlanName: plans.name,
  minPlanOrder: plans.sortOrder,
};

export type JogoDoAluno = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  liberado: boolean;
  /** O plano que libera o jogo, quando ele não é de todos. */
  planoMinimo: string | null;
};

export async function listarJogosDoAluno(userId: string): Promise<JogoDoAluno[]> {
  const [ordem, linhas] = await Promise.all([
    ordemDoPlanoDoAluno(userId),
    db
      .select(colunasDoJogo)
      .from(games)
      .leftJoin(plans, eq(plans.id, games.minPlanId))
      .where(eq(games.isPublished, true))
      .orderBy(asc(games.sortOrder), desc(games.createdAt)),
  ]);

  const assinadas = await signContentUrls(
    linhas.map((linha) => linha.imageStoragePath).filter((p): p is string => Boolean(p)),
  );

  return linhas.map((linha) => ({
    id: linha.id,
    title: linha.title,
    description: linha.description,
    imageUrl: linha.imageStoragePath ? (assinadas.get(linha.imageStoragePath) ?? null) : null,
    liberado: podeJogar(ordem, linha.minPlanId ? linha.minPlanOrder : null),
    planoMinimo: linha.minPlanId ? linha.minPlanName : null,
  }));
}

export type JogoParaJogar =
  | { ok: true; jogo: { id: string; title: string; description: string | null; gameUrl: string } }
  | { ok: false; motivo: "nao_encontrado" }
  | { ok: false; motivo: "plano"; planoMinimo: string | null; title: string };

/**
 * O jogo para a página de jogar.
 *
 * ⚠️ O PLANO É CONFERIDO AQUI, NO SERVIDOR, e não só escondendo o botão. Quem
 * digitasse `/jogos/<id>` na barra de endereço abriria um jogo do Premium com a
 * conta gratuita se a regra morasse só no cartão da lista.
 */
export async function obterJogoParaJogar(userId: string, id: string): Promise<JogoParaJogar> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, motivo: "nao_encontrado" };

  const [[linha], ordem] = await Promise.all([
    db
      .select(colunasDoJogo)
      .from(games)
      .leftJoin(plans, eq(plans.id, games.minPlanId))
      .where(and(eq(games.id, id), eq(games.isPublished, true)))
      .limit(1),
    ordemDoPlanoDoAluno(userId),
  ]);

  if (!linha) return { ok: false, motivo: "nao_encontrado" };

  if (!podeJogar(ordem, linha.minPlanId ? linha.minPlanOrder : null)) {
    return { ok: false, motivo: "plano", planoMinimo: linha.minPlanName, title: linha.title };
  }

  return {
    ok: true,
    jogo: {
      id: linha.id,
      title: linha.title,
      description: linha.description,
      gameUrl: linha.gameUrl,
    },
  };
}

/* ========================================================================== *
 * PAINEL
 * ========================================================================== */

export type JogoNoPainel = {
  id: string;
  title: string;
  description: string | null;
  gameUrl: string;
  imageStoragePath: string | null;
  imageUrl: string | null;
  minPlanId: string | null;
  minPlanName: string | null;
  isPublished: boolean;
};

export async function listarJogosParaOPainel(): Promise<JogoNoPainel[]> {
  const linhas = await db
    .select(colunasDoJogo)
    .from(games)
    .leftJoin(plans, eq(plans.id, games.minPlanId))
    .orderBy(asc(games.sortOrder), desc(games.createdAt));

  const assinadas = await signContentUrls(
    linhas.map((linha) => linha.imageStoragePath).filter((p): p is string => Boolean(p)),
  );

  return linhas.map((linha) => ({
    id: linha.id,
    title: linha.title,
    description: linha.description,
    gameUrl: linha.gameUrl,
    imageStoragePath: linha.imageStoragePath,
    imageUrl: linha.imageStoragePath ? (assinadas.get(linha.imageStoragePath) ?? null) : null,
    minPlanId: linha.minPlanId,
    minPlanName: linha.minPlanId ? linha.minPlanName : null,
    isPublished: linha.isPublished,
  }));
}

/** Os planos que podem ser escolhidos como plano mínimo, na ordem da página de planos. */
export async function listarPlanosParaJogos(): Promise<Array<{ id: string; name: string }>> {
  return db
    .select({ id: plans.id, name: plans.name })
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(asc(plans.sortOrder));
}

export type ResultadoDoJogo = { ok: true } | { ok: false; message: string };

export async function salvarJogo(input: {
  id: string | null;
  title: string;
  description: string | null;
  gameUrl: string;
  imageStoragePath: string | null;
  minPlanId: string | null;
  isPublished: boolean;
  createdByUserId: string;
}): Promise<ResultadoDoJogo> {
  const titulo = input.title.trim();
  if (!titulo) return { ok: false, message: "Dê um nome ao jogo." };
  if (titulo.length > 120) return { ok: false, message: "O nome do jogo passou de 120 caracteres." };

  const link = validarLinkDoJogo(input.gameUrl);
  if (!link.ok) return { ok: false, message: link.message };

  if (input.minPlanId) {
    const plano = await db.query.plans.findFirst({
      where: (t, { eq: e }) => e(t.id, input.minPlanId as string),
      columns: { id: true },
    });
    if (!plano) return { ok: false, message: "Escolha um plano da lista." };
  }

  const valores = {
    title: titulo,
    description: input.description?.trim() || null,
    gameUrl: link.url,
    imageStoragePath: input.imageStoragePath,
    minPlanId: input.minPlanId,
    isPublished: input.isPublished,
  };

  if (input.id) {
    const atualizados = await db
      .update(games)
      .set({ ...valores, updatedAt: new Date() })
      .where(eq(games.id, input.id))
      .returning({ id: games.id });

    if (atualizados.length === 0) return { ok: false, message: "Esse jogo não existe mais." };
    return { ok: true };
  }

  await db.insert(games).values({ ...valores, createdByUserId: input.createdByUserId });
  return { ok: true };
}

export async function apagarJogo(id: string): Promise<boolean> {
  const apagados = await db.delete(games).where(eq(games.id, id)).returning({ id: games.id });
  return apagados.length > 0;
}
