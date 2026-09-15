/**
 * VISITAS AO SITE — AS REGRAS PURAS (pedido da cliente em 15/09/2026).
 * ============================================================================
 *
 * Ela pediu no painel: visitantes, visitantes únicos, recorrentes, online
 * agora e tempo médio de uso.
 *
 * ⚠️ SEM COOKIE NOVO. A Política de Privacidade diz, na seção 8: "Usamos apenas
 * o cookie estritamente necessário para manter você autenticado". Um cookie de
 * visitante desmentiria o documento que o aluno aceitou no cadastro.
 *
 * Então a identidade do visitante sai do que já existe:
 *
 *   • LOGADO: um hash do id da conta. Estável entre os dias, e é o que permite
 *     dizer quem VOLTOU.
 *   • SEM LOGIN: um hash do dia + IP truncado + navegador. Nada fica guardado no
 *     aparelho e o IP não é gravado. O preço é honesto e aparece no painel: a
 *     mesma pessoa sem login conta uma vez por dia, e não dá para saber se ela
 *     voltou amanhã.
 */

/** De quanto em quanto tempo a aba visível avisa que continua aberta. */
export const INTERVALO_DA_BATIDA_S = 30;

/** Sem sinal por este tempo, a próxima batida abre uma visita nova. */
export const VISITA_ENCERRA_APOS_MIN = 30;

/** "Online agora" = deu sinal nos últimos N minutos. */
export const JANELA_ONLINE_MIN = 2;

/**
 * ⚠️ SÓ CONTA O TEMPO ENTRE BATIDAS PRÓXIMAS.
 *
 * A aba escondida não bate. Quando a pessoa volta depois de vinte minutos em
 * outro app, o intervalo desde a última batida é tempo FORA da plataforma, e
 * somá-lo inflaria o tempo médio justamente com quem saiu.
 */
const MAIOR_INTERVALO_CONTADO_S = 90;

export function segundosAContar(ultimaBatida: Date, agora: Date): number {
  const segundos = Math.round((agora.getTime() - ultimaBatida.getTime()) / 1000);
  if (segundos <= 0) return 0;
  return segundos <= MAIOR_INTERVALO_CONTADO_S ? segundos : 0;
}

/**
 * Robôs, pré-visualização de link e navegador automatizado ficam de fora.
 *
 * O WhatsApp busca a página para montar o card do link, e é por ele que o site
 * circula: sem este filtro, cada link compartilhado viraria um "visitante".
 */
export function ehRobo(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|node-fetch|axios/i.test(
    userAgent,
  );
}

export type TipoDeAparelho = "mobile" | "tablet" | "desktop" | "unknown";

export function tipoDeAparelho(userAgent: string | null): TipoDeAparelho {
  if (!userAgent) return "unknown";
  if (/ipad|tablet/i.test(userAgent)) return "tablet";
  if (/mobi|iphone|android/i.test(userAgent)) return "mobile";
  return "desktop";
}

/**
 * O IP entra no hash TRUNCADO: /24 no IPv4, /48 no IPv6.
 *
 * Basta para separar duas pessoas na mesma hora e deixa de apontar para uma
 * casa específica. O primeiro endereço do `x-forwarded-for` é o do visitante;
 * os seguintes são os proxies do caminho.
 */
export function truncarIp(encaminhado: string | null): string {
  const ip = encaminhado?.split(",")[0]?.trim() ?? "";
  if (!ip) return "";

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return `${ip.split(".").slice(0, 3).join(".")}.0`;
  }

  if (ip.includes(":")) {
    return `${ip.split(":").slice(0, 3).join(":")}::`;
  }

  return "";
}

/**
 * O caminho que o navegador mandou, se servir.
 *
 * ⚠️ O PAINEL NÃO ENTRA: a cliente navegando no próprio painel viraria
 * "visitante" todo dia e esconderia o número que ela quer ver.
 */
export function caminhoDaVisita(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  if (!bruto.startsWith("/") || bruto.length > 300) return null;
  if (bruto === "/admin" || bruto.startsWith("/admin/")) return null;
  return bruto;
}

export type PeriodoDasVisitas = "hoje" | "7" | "30";

export const PERIODOS_DAS_VISITAS: Array<{ valor: PeriodoDasVisitas; rotulo: string; dias: number }> = [
  { valor: "hoje", rotulo: "Hoje", dias: 1 },
  { valor: "7", rotulo: "7 dias", dias: 7 },
  { valor: "30", rotulo: "30 dias", dias: 30 },
];

export function lerPeriodo(bruto: unknown): PeriodoDasVisitas {
  return PERIODOS_DAS_VISITAS.some((p) => p.valor === bruto) ? (bruto as PeriodoDasVisitas) : "7";
}

/** 45 → 45 s; 200 → 3 min. Nulo quando ainda não há visita no período. */
export function formatarDuracao(segundos: number | null): { valor: number | null; sufixo: string } {
  if (segundos === null) return { valor: null, sufixo: "" };
  if (segundos < 60) return { valor: Math.round(segundos), sufixo: " s" };
  return { valor: Math.round(segundos / 60), sufixo: " min" };
}
