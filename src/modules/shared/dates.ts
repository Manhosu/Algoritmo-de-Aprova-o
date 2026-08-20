/**
 * Datas civis — o "dia" do produto.
 *
 * Metade das regras do sistema depende de "que dia é hoje" no fuso do aluno:
 * a Tarefa do Dia vira à meia-noite de Brasília, a revisão vence num dia, o
 * streak quebra num dia, o limite de questões zera num dia, a retenção D+1 do
 * funil é um dia.
 *
 * `Date` do JavaScript é um INSTANTE, não um dia. Somar 24 horas a um instante
 * atravessa o horário de verão errado e devolve o dia anterior ou o seguinte.
 * Por isso o tipo aqui é uma STRING "AAAA-MM-DD", e a aritmética é feita sobre
 * ela — não sobre `Date`.
 *
 * A única operação que precisa de dados de fuso é converter um instante em dia
 * civil. Isso é feito com `Intl`, que é padrão da linguagem e traz a base de
 * fusos do próprio runtime — sem dependência e sem tabela para manter.
 *
 * ⚠️ Nenhuma função deste arquivo chama `new Date()` sem argumento. O instante
 * atual sempre entra por parâmetro. É o que permite testar a virada da
 * meia-noite, o horário de verão e o dia da prova sem depender do relógio da
 * máquina.
 */

/** Data civil no formato "AAAA-MM-DD". */
export type CivilDate = string & { readonly __brand?: "CivilDate" };

const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isCivilDate(value: string): value is CivilDate {
  if (!CIVIL_DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Rejeita 31/02 e afins: o round-trip só bate em data que existe.
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
  );
}

function assertCivilDate(value: string): asserts value is CivilDate {
  if (!isCivilDate(value)) {
    throw new Error(`Data civil inválida: "${value}". Formato esperado: AAAA-MM-DD.`);
  }
}

/* ========================================================================== *
 * CONVERSÃO ENTRE INSTANTE E DIA CIVIL
 * ========================================================================== */

/**
 * Formatadores são caros de construir e são consultados a cada resposta de
 * questão. Um por fuso, reaproveitado.
 */
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();
const hourFormatterCache = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dateFormatterCache.get(timeZone);
  if (!formatter) {
    // "en-CA" produz exatamente AAAA-MM-DD.
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function hourFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = hourFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    });
    hourFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** O dia civil em que este instante caiu, no fuso informado. */
export function toCivilDate(instant: Date, timeZone: string): CivilDate {
  return dateFormatter(timeZone).format(instant) as CivilDate;
}

/**
 * A hora local (0–23) em que este instante caiu.
 * É o que alimenta o "Horário de Ouro".
 */
export function toLocalHour(instant: Date, timeZone: string): number {
  const formatted = hourFormatter(timeZone).format(instant);
  // Alguns runtimes devolvem "24" para a meia-noite.
  const hour = Number.parseInt(formatted, 10) % 24;
  return hour;
}

/**
 * O instante em que um dia civil COMEÇA no fuso informado.
 *
 * Usado para o vencimento das revisões: a revisão do dia 15 vence à meia-noite
 * do dia 15 em Brasília, não às 3h da manhã em UTC.
 *
 * Faz uma busca de dois passos porque o deslocamento do fuso depende da própria
 * data — inclusive nos dias em que o horário de verão muda.
 */
export function startOfCivilDay(date: CivilDate, timeZone: string): Date {
  assertCivilDate(date);
  const [year, month, day] = date.split("-").map(Number);

  // Palpite: trata os componentes como se fossem UTC.
  let guess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);

  // Corrige pelo deslocamento real do fuso naquele instante, duas vezes —
  // a segunda passada resolve o caso em que a correção atravessa a mudança
  // de horário de verão.
  for (let i = 0; i < 2; i++) {
    const offset = timeZoneOffsetMs(new Date(guess), timeZone);
    guess = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - offset;
  }

  return new Date(guess);
}

/** Deslocamento do fuso, em milissegundos, no instante informado. */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );

  return asUtc - instant.getTime();
}

/* ========================================================================== *
 * ARITMÉTICA SOBRE DIAS CIVIS
 * ========================================================================== */

/**
 * Soma dias a uma data civil.
 *
 * Feita em UTC de propósito: UTC não tem horário de verão, então somar 24 horas
 * sempre avança exatamente um dia. Aplicar isso a um fuso com horário de verão
 * daria 23 ou 25 horas e pularia ou repetiria um dia por ano.
 */
export function addDays(date: CivilDate, days: number): CivilDate {
  assertCivilDate(date);
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return formatUtcAsCivilDate(shifted);
}

function formatUtcAsCivilDate(instant: Date): CivilDate {
  const year = String(instant.getUTCFullYear()).padStart(4, "0");
  const month = String(instant.getUTCMonth() + 1).padStart(2, "0");
  const day = String(instant.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}` as CivilDate;
}

/** Dias inteiros de `from` até `to`. Negativo quando `to` é anterior. */
export function daysBetween(from: CivilDate, to: CivilDate): number {
  assertCivilDate(from);
  assertCivilDate(to);
  return Math.round((civilDateToUtcMs(to) - civilDateToUtcMs(from)) / 86_400_000);
}

function civilDateToUtcMs(date: CivilDate): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** 0 = domingo … 6 = sábado. Mesma convenção de `Date.getDay()`. */
export function weekdayOf(date: CivilDate): number {
  assertCivilDate(date);
  return new Date(civilDateToUtcMs(date)).getUTCDay();
}

export function compareCivilDates(a: CivilDate, b: CivilDate): number {
  // O formato AAAA-MM-DD ordena corretamente como texto.
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBefore(a: CivilDate, b: CivilDate): boolean {
  return compareCivilDates(a, b) < 0;
}

export function isSameOrBefore(a: CivilDate, b: CivilDate): boolean {
  return compareCivilDates(a, b) <= 0;
}

export function minCivilDate(a: CivilDate, b: CivilDate): CivilDate {
  return isBefore(a, b) ? a : b;
}

export function maxCivilDate(a: CivilDate, b: CivilDate): CivilDate {
  return isBefore(a, b) ? b : a;
}

/**
 * Dias completos entre dois instantes, medidos em dias civis.
 *
 * Usado pelo sinal de recência. Medir em dias civis, e não em horas, é o que
 * faz "estudei ontem à noite" e "estudei ontem de manhã" contarem igual — que é
 * como o aluno percebe o tempo.
 */
export function civilDaysSince(
  past: Date,
  now: Date,
  timeZone: string,
): number {
  return daysBetween(toCivilDate(past, timeZone), toCivilDate(now, timeZone));
}
