import type { CivilDate } from "@/modules/shared/dates";

/**
 * PROMOÇÕES DE PLANO, COM DATA DE INÍCIO E FIM.
 * ============================================================================
 *
 * Pedido da cliente em 11/09/2026: "amei a ideia de criar promoção pelo painel
 * administrativo, estipulando a data de início e fim. Sobre o preço
 * promocional pode manter até o final da assinatura".
 *
 * ⚠️ QUEM ASSINA NA PROMOÇÃO FICA COM O PREÇO DA PROMOÇÃO, e isso não depende
 * deste módulo. O valor vai para a assinatura do Mercado Pago no momento em
 * que ela nasce, e o Mercado Pago cobra aquele valor enquanto ela existir.
 * Encerrar a promoção só muda o preço de quem assinar DEPOIS — do mesmo jeito
 * que mudar o preço normal nunca altera assinatura antiga.
 *
 * Funções puras: o servidor lê as linhas e decide aqui.
 */

export type PeriodoDeCobranca = "monthly" | "annual";

export type Promocao = {
  id: string;
  planId: string;
  billingPeriod: PeriodoDeCobranca;
  amountCents: number;
  startsOn: CivilDate;
  endsOn: CivilDate;
  canceledAt: Date | null;
};

export type SituacaoDaPromocao = "agendada" | "vigente" | "encerrada" | "cancelada";

/**
 * Em que pé a promoção está hoje.
 *
 * As datas são DIAS CIVIS, inclusivos nas duas pontas: uma promoção de 15/09 a
 * 20/09 vale o dia 20 inteiro. Datas civis no formato AAAA-MM-DD comparam
 * certo como texto.
 */
export function situacaoDaPromocao(
  promocao: Pick<Promocao, "startsOn" | "endsOn" | "canceledAt">,
  hoje: CivilDate,
): SituacaoDaPromocao {
  if (promocao.canceledAt) return "cancelada";
  if (hoje < promocao.startsOn) return "agendada";
  if (hoje > promocao.endsOn) return "encerrada";
  return "vigente";
}

/** A promoção que vale hoje para este plano e período, se houver. */
export function promocaoVigente<T extends Promocao>(
  promocoes: T[],
  planId: string,
  periodo: PeriodoDeCobranca,
  hoje: CivilDate,
): T | null {
  const vigentes = promocoes.filter(
    (p) =>
      p.planId === planId &&
      p.billingPeriod === periodo &&
      situacaoDaPromocao(p, hoje) === "vigente",
  );

  /*
    A criação recusa sobreposição, então aqui deveria haver uma no máximo. Se
    houver duas (uma escrita direto no banco, por exemplo), vale a que começou
    por último — é a decisão mais recente de quem administra.
  */
  return vigentes.sort((a, b) => (a.startsOn < b.startsOn ? 1 : -1))[0] ?? null;
}

export type NovaPromocao = {
  planId: string;
  billingPeriod: PeriodoDeCobranca;
  amountCents: number;
  startsOn: CivilDate;
  endsOn: CivilDate;
};

/**
 * O que impede de criar a promoção, em frases para a tela. Vazio = pode criar.
 */
export function validarPromocao(
  nova: NovaPromocao,
  contexto: {
    nomeDoPlano: string;
    /** O preço normal do plano naquele período, ou nulo se não houver. */
    precoNormalCents: number | null;
    hoje: CivilDate;
    existentes: Promocao[];
  },
): string[] {
  const problemas: string[] = [];
  const periodo = nova.billingPeriod === "annual" ? "anual" : "mensal";

  if (contexto.precoNormalCents === null) {
    problemas.push(`O ${contexto.nomeDoPlano} não tem preço ${periodo} cadastrado.`);
  }

  if (!Number.isInteger(nova.amountCents) || nova.amountCents <= 0) {
    problemas.push("Informe o preço promocional.");
  } else if (contexto.precoNormalCents !== null && nova.amountCents >= contexto.precoNormalCents) {
    problemas.push(
      `O preço promocional precisa ser menor que o normal (${formatarCentavos(contexto.precoNormalCents)}).`,
    );
  }

  if (!ehDataCivil(nova.startsOn) || !ehDataCivil(nova.endsOn)) {
    problemas.push("Informe a data de início e a de fim.");
    return problemas;
  }

  if (nova.endsOn < nova.startsOn) problemas.push("A data de fim vem antes da de início.");
  if (nova.endsOn < contexto.hoje) problemas.push("A promoção terminaria no passado.");

  /*
    ⚠️ DUAS PROMOÇÕES DO MESMO PLANO NÃO SE SOBREPÕEM. Com duas valendo no mesmo
    dia, a página de planos mostraria um preço e o checkout cobraria o outro
    conforme a ordem de leitura — e ninguém saberia dizer qual era a oferta.
  */
  const conflito = contexto.existentes.find(
    (p) =>
      p.planId === nova.planId &&
      p.billingPeriod === nova.billingPeriod &&
      p.canceledAt === null &&
      p.startsOn <= nova.endsOn &&
      nova.startsOn <= p.endsOn,
  );

  if (conflito) {
    problemas.push(
      `Já existe uma promoção do ${contexto.nomeDoPlano} ${periodo} de ` +
        `${formatarDataCivil(conflito.startsOn)} a ${formatarDataCivil(conflito.endsOn)}. ` +
        "Encerre aquela, ou escolha outras datas.",
    );
  }

  return problemas;
}

/**
 * "69,90", "R$ 69,90", "1.234,56" e "69.90" viram centavos. O que não for
 * número vira nulo — quem chama transforma isso em "informe o preço".
 */
export function lerPrecoEmCentavos(texto: string): number | null {
  let limpo = texto.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!limpo) return null;

  /* Com vírgula, o ponto é separador de milhar; sem vírgula, é decimal. */
  if (limpo.includes(",")) limpo = limpo.replace(/\./g, "").replace(",", ".");

  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;

  return Math.round(Number(limpo) * 100);
}

export function formatarCentavos(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    centavos / 100,
  );
}

/** "2026-09-15" → "15/09/2026". */
export function formatarDataCivil(data: CivilDate): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function ehDataCivil(valor: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor);
}
