import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import padrao from "@/content/landing.json";
import { landingSchema, type LandingCopy } from "@/content/landing-schema";
import { db } from "@/server/db";
import { siteContent } from "@/server/db/schema";

const CHAVE = "landing";

/**
 * A copy da página inicial: a versão publicada, ou o texto de fábrica.
 *
 * ⚠️ NUNCA LANÇA. A página inicial é a porta da rua: se o banco estiver fora ou
 * a linha vigente estiver corrompida, a resposta certa é servir o texto de
 * fábrica, não um 500. Um título desatualizado é um problema pequeno; a home
 * fora do ar é o maior de todos.
 *
 * `landing.json` é esse texto de fábrica. Ele também é o que roda em
 * desenvolvimento antes de qualquer publicação, então o site funciona num banco
 * recém-criado, sem seed nenhum.
 */
export async function getLandingCopy(): Promise<LandingCopy> {
  try {
    const linha = await db.query.siteContent.findFirst({
      where: (t, { and: e, eq: i }) => e(i(t.key, CHAVE), i(t.isCurrent, true)),
      columns: { content: true },
    });

    if (!linha) return landingSchema.parse(padrao);

    const conferido = landingSchema.safeParse(linha.content);
    if (conferido.success) return conferido.data;

    // Linha vigente fora do contrato: aconteceria se o schema ganhasse um campo
    // e a versão publicada fosse anterior a ele. O texto de fábrica tem o campo.
    console.error("Copy publicada fora do contrato; usando o texto de fábrica.");
    return landingSchema.parse(padrao);
  } catch (erro) {
    console.error("Falha ao ler a copy publicada:", erro);
    return landingSchema.parse(padrao);
  }
}

/** A versão vigente e o histórico, para a tela de edição. */
export async function getLandingHistory(): Promise<
  Array<{ version: number; note: string | null; isCurrent: boolean; createdAt: Date }>
> {
  return db
    .select({
      version: siteContent.version,
      note: siteContent.note,
      isCurrent: siteContent.isCurrent,
      createdAt: siteContent.createdAt,
    })
    .from(siteContent)
    .where(eq(siteContent.key, CHAVE))
    .orderBy(sql`${siteContent.version} desc`)
    .limit(20);
}

export type PublishResult =
  | { ok: true; version: number }
  | { ok: false; problems: string[] };

/**
 * Publica uma copy nova.
 *
 * ⚠️ O `revalidatePath` NO FIM NÃO É DETALHE — é o que faz a mudança aparecer.
 * A página inicial é estática e servida do cache da borda; sem invalidar, a
 * cliente salvaria, veria "publicado", abriria o site e encontraria o texto
 * antigo. Ela concluiria que não funciona, e estaria certa.
 *
 * A versão nova entra e a anterior perde `is_current` na MESMA transação: no
 * meio do caminho existiria um instante com duas versões vigentes, e a leitura
 * pegaria qualquer uma das duas.
 */
export async function publishLandingCopy(input: {
  content: unknown;
  userId: string;
  note?: string | null;
}): Promise<PublishResult> {
  const conferido = landingSchema.safeParse(input.content);

  if (!conferido.success) {
    return {
      ok: false,
      problems: conferido.error.issues.map(
        (problema) => `${problema.path.join(" › ")}: ${problema.message}`,
      ),
    };
  }

  const version = await db.transaction(async (tx) => {
    const [ultima] = await tx
      .select({ version: siteContent.version })
      .from(siteContent)
      .where(eq(siteContent.key, CHAVE))
      .orderBy(sql`${siteContent.version} desc`)
      .limit(1);

    const proxima = (ultima?.version ?? 0) + 1;

    await tx
      .update(siteContent)
      .set({ isCurrent: false })
      .where(and(eq(siteContent.key, CHAVE), eq(siteContent.isCurrent, true)));

    await tx.insert(siteContent).values({
      key: CHAVE,
      version: proxima,
      content: conferido.data,
      publishedByUserId: input.userId,
      note: input.note?.trim() || null,
      isCurrent: true,
    });

    return proxima;
  });

  revalidatePath("/");

  return { ok: true, version };
}

/**
 * Volta para uma versão anterior.
 *
 * Copiar o conteúdo para uma versão NOVA, em vez de reativar a linha antiga,
 * mantém o histórico linear: "voltamos ao texto da v3" fica registrado como um
 * ato, com data e autor, e não como um buraco na sequência.
 */
export async function restoreLandingVersion(input: {
  version: number;
  userId: string;
}): Promise<PublishResult> {
  const alvo = await db.query.siteContent.findFirst({
    where: (t, { and: e, eq: i }) => e(i(t.key, CHAVE), i(t.version, input.version)),
    columns: { content: true },
  });

  if (!alvo) return { ok: false, problems: ["Versão não encontrada."] };

  return publishLandingCopy({
    content: alvo.content,
    userId: input.userId,
    note: `Voltou para a versão ${input.version}`,
  });
}
