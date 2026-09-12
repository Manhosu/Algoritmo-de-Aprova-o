"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatarCentavos, formatarDataCivil } from "@/modules/billing/promotions";

import {
  createPromotionAction,
  endPromotionAction,
  type PromotionFormState,
} from "./promotion-actions";

/**
 * PROMOÇÕES NA ABA PLANOS DO PAINEL.
 *
 * Pedido da cliente em 11/09/2026: "criar promoção pelo painel administrativo,
 * estipulando a data de início e fim". O preço promocional fica na assinatura
 * de quem assina durante a promoção até o fim dela — ver
 * `modules/billing/promotions`.
 *
 * ⚠️ A AÇÃO É CHAMADA DE DENTRO DO `onSubmit`, e não por `action={}`: o React 19
 * limpa o formulário mesmo quando a ação recusa, e a cliente perderia o que
 * digitou por causa de uma data trocada.
 */

type PlanoParaPromocao = {
  id: string;
  name: string;
  mensalCents: number | null;
  anualCents: number | null;
};

type PromocaoNaLista = {
  id: string;
  planName: string;
  billingPeriod: "monthly" | "annual";
  amountCents: number;
  precoNormalCents: number | null;
  startsOn: string;
  endsOn: string;
  situacao: "agendada" | "vigente" | "encerrada" | "cancelada";
};

const NOME_DA_SITUACAO: Record<PromocaoNaLista["situacao"], string> = {
  agendada: "Agendada",
  vigente: "Em vigor",
  encerrada: "Encerrada",
  cancelada: "Encerrada antes da hora",
};

const INICIAL: PromotionFormState = { ok: false };

const CLASSE_CAMPO =
  "h-11 rounded-lg border border-input bg-input px-3 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/*
  A lista aberta de um `<select>` não herda a cor do campo: no Windows e no
  Android ela abre branca, e o texto claro some. Ver `select-contrast.test.ts`.
*/
const CLASSE_SELECT =
  "h-11 rounded-lg border border-input bg-input px-3 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&>option]:bg-card [&>option]:text-foreground";

export function PromotionsPanel({
  planos,
  promocoes,
}: {
  planos: PlanoParaPromocao[];
  promocoes: PromocaoNaLista[];
}) {
  const [estado, dispatch] = useActionState(createPromotionAction, INICIAL);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  /* Criada com sucesso, o formulário volta ao branco para a próxima. */
  useEffect(() => {
    if (estado.ok) formRef.current?.reset();
  }, [estado]);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => dispatch(dados));
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="font-semibold text-foreground">Promoções</h2>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          Um preço menor entre duas datas. Quem assinar durante a promoção mantém
          o preço promocional enquanto a assinatura durar. Assinaturas que já
          existem não mudam.
        </p>
      </div>

      <form ref={formRef} onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="promo-plano">Plano</Label>
          <select id="promo-plano" name="planId" required className={CLASSE_SELECT}>
            {planos.map((plano) => (
              <option key={plano.id} value={plano.id}>
                {plano.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="promo-periodo">Período</Label>
          <select id="promo-periodo" name="billingPeriod" className={CLASSE_SELECT}>
            <option value="monthly">Mensal</option>
            <option value="annual">Anual</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="promo-preco">Preço promocional (R$)</Label>
          <input
            id="promo-preco"
            name="preco"
            inputMode="decimal"
            placeholder="69,90"
            required
            className={CLASSE_CAMPO}
          />
          <p className="text-xs text-pretty text-muted-foreground">
            Preço normal:{" "}
            {planos
              .map(
                (p) =>
                  `${p.name} ${p.mensalCents ? `${formatarCentavos(p.mensalCents)}/mês` : ""}${
                    p.anualCents ? ` · ${formatarCentavos(p.anualCents)}/ano` : ""
                  }`,
              )
              .join(" — ")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promo-inicio">Início</Label>
            <input id="promo-inicio" name="inicio" type="date" required className={CLASSE_CAMPO} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="promo-fim">Fim</Label>
            <input id="promo-fim" name="fim" type="date" required className={CLASSE_CAMPO} />
          </div>
        </div>

        {estado.message || estado.problems?.length ? (
          <div
            role="status"
            className={`rounded-lg border px-3 py-2.5 text-sm sm:col-span-2 ${
              estado.ok
                ? "border-success/40 bg-success/10 text-foreground"
                : "border-destructive/40 bg-destructive/10 text-foreground"
            }`}
          >
            {estado.message ? <p>{estado.message}</p> : null}
            {estado.problems?.length ? (
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
                {estado.problems.map((problema) => (
                  <li key={problema}>{problema}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <Button type="submit" disabled={pending} className="sm:col-span-2 sm:justify-self-start">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Criar promoção
        </Button>
      </form>

      {promocoes.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border border-t border-border">
          {promocoes.map((promocao) => (
            <li key={promocao.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm">
              <span className="min-w-0 flex-1 text-pretty">
                <span className="font-medium text-foreground">
                  {promocao.planName} {promocao.billingPeriod === "annual" ? "anual" : "mensal"}
                </span>{" "}
                <span className="text-foreground">{formatarCentavos(promocao.amountCents)}</span>
                {promocao.precoNormalCents ? (
                  <span className="text-muted-foreground line-through">
                    {" "}
                    {formatarCentavos(promocao.precoNormalCents)}
                  </span>
                ) : null}
                <span className="block text-xs text-muted-foreground">
                  {formatarDataCivil(promocao.startsOn)} a {formatarDataCivil(promocao.endsOn)} ·{" "}
                  {NOME_DA_SITUACAO[promocao.situacao]}
                </span>
              </span>

              {promocao.situacao === "agendada" || promocao.situacao === "vigente" ? (
                <EncerrarPromocao id={promocao.id} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function EncerrarPromocao({ id }: { id: string }) {
  const [estado, dispatch] = useActionState(endPromotionAction, INICIAL);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        const dados = new FormData(evento.currentTarget);
        startTransition(() => dispatch(dados));
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="outline" disabled={pending || estado.ok}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {estado.ok ? "Encerrada" : "Encerrar agora"}
      </Button>
    </form>
  );
}
