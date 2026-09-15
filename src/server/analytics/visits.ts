import "server-only";

import { createHmac } from "node:crypto";

import { and, desc, eq, gt, sql } from "drizzle-orm";

import { env } from "@/config/env";
import {
  JANELA_ONLINE_MIN,
  PERIODOS_DAS_VISITAS,
  VISITA_ENCERRA_APOS_MIN,
  segundosAContar,
  type PeriodoDasVisitas,
  type TipoDeAparelho,
} from "@/modules/analytics/visits";
import { db } from "@/server/db";
import { siteVisits } from "@/server/db/schema";

/**
 * VISITAS AO SITE — gravação das batidas e leitura para o painel.
 * Regras e motivos em `modules/analytics/visits`.
 */

const FUSO = "America/Sao_Paulo";

function diaEmSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(agora);
}

/**
 * O hash que identifica o visitante. Com o segredo de pseudonimização, e não um
 * SHA puro: sem o segredo, ninguém recalcula a chave de uma conta conhecida.
 */
export function chaveDoVisitante(input: {
  userId: string | null;
  ipTruncado: string;
  userAgent: string;
  agora: Date;
}): string {
  const hmac = createHmac("sha256", env.ANONYMIZATION_PEPPER);

  if (input.userId) {
    hmac.update(`conta:${input.userId}`);
  } else {
    hmac.update(`anonimo:${diaEmSaoPaulo(input.agora)}:${input.ipTruncado}:${input.userAgent}`);
  }

  return hmac.digest("hex");
}

/**
 * Soma a batida à visita aberta deste visitante, ou abre uma nova.
 *
 * "Aberta" é quem deu sinal nos últimos 30 minutos. Duas abas do mesmo aluno
 * caem na mesma visita, que é o que ele é: uma pessoa usando o site.
 */
export async function registrarBatida(input: {
  visitorKey: string;
  authenticated: boolean;
  tipo: "pagina" | "batida";
  path: string;
  device: TipoDeAparelho;
  agora: Date;
}): Promise<void> {
  const limite = new Date(input.agora.getTime() - VISITA_ENCERRA_APOS_MIN * 60_000);

  const [aberta] = await db
    .select({ id: siteVisits.id, lastSeenAt: siteVisits.lastSeenAt })
    .from(siteVisits)
    .where(and(eq(siteVisits.visitorKey, input.visitorKey), gt(siteVisits.lastSeenAt, limite)))
    .orderBy(desc(siteVisits.lastSeenAt))
    .limit(1);

  if (aberta) {
    const segundos = segundosAContar(aberta.lastSeenAt, input.agora);
    const paginas = input.tipo === "pagina" ? 1 : 0;

    await db
      .update(siteVisits)
      .set({
        lastSeenAt: input.agora,
        durationSeconds: sql`${siteVisits.durationSeconds} + ${segundos}`,
        pageCount: sql`${siteVisits.pageCount} + ${paginas}`,
      })
      .where(eq(siteVisits.id, aberta.id));
    return;
  }

  await db.insert(siteVisits).values({
    visitorKey: input.visitorKey,
    authenticated: input.authenticated,
    startedAt: input.agora,
    lastSeenAt: input.agora,
    entryPath: input.path,
    deviceType: input.device,
  });
}

export type ResumoDeVisitas = {
  visitas: number;
  unicos: number;
  recorrentes: number;
  onlineAgora: number;
  /** Média por visita, em segundos. Nulo sem visita no período. */
  mediaSegundos: number | null;
};

export async function lerVisitas(periodo: PeriodoDasVisitas): Promise<ResumoDeVisitas> {
  const dias = PERIODOS_DAS_VISITAS.find((p) => p.valor === periodo)?.dias ?? 7;

  /* Meia-noite de São Paulo, N-1 dias atrás. `dias` vem da tabela fixa acima. */
  const inicio = sql`(date_trunc('day', now() at time zone ${FUSO}) - interval '${sql.raw(String(dias - 1))} days') at time zone ${FUSO}`;

  const [resumo, recorrentes, online] = await Promise.all([
    db
      .select({
        visitas: sql<number>`count(*)::int`,
        unicos: sql<number>`count(distinct ${siteVisits.visitorKey})::int`,
        mediaSegundos: sql<number | null>`avg(${siteVisits.durationSeconds})::float`,
      })
      .from(siteVisits)
      .where(sql`${siteVisits.startedAt} >= ${inicio}`),

    /*
      Recorrente = quem já tinha visitado em OUTRO DIA antes. Para quem navega
      sem login a chave muda todo dia, então só aluno logado entra aqui; o
      painel diz isso por escrito.
    */
    db.execute<{ n: number }>(sql`
      select count(distinct v.visitor_key)::int as n
        from site_visits v
       where v.started_at >= ${inicio}
         and exists (
           select 1
             from site_visits a
            where a.visitor_key = v.visitor_key
              and (a.started_at at time zone ${FUSO})::date < (v.started_at at time zone ${FUSO})::date
         )
    `),

    db
      .select({ n: sql<number>`count(distinct ${siteVisits.visitorKey})::int` })
      .from(siteVisits)
      .where(
        sql`${siteVisits.lastSeenAt} > now() - interval '${sql.raw(String(JANELA_ONLINE_MIN))} minutes'`,
      ),
  ]);

  return {
    visitas: resumo[0]?.visitas ?? 0,
    unicos: resumo[0]?.unicos ?? 0,
    recorrentes: Number(recorrentes[0]?.n ?? 0),
    onlineAgora: online[0]?.n ?? 0,
    mediaSegundos: resumo[0]?.mediaSegundos ?? null,
  };
}
