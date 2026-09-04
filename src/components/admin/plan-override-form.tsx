"use client";

import { useActionState, useState, useTransition } from "react";

import { setPlanAction, type PlanOverrideState } from "./plan-actions";

const INICIAL: PlanOverrideState = { ok: false };

const CLASSE_CAMPO =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm [&>option]:bg-card [&>option]:text-foreground";

/**
 * Troca o plano de um aluno pelo painel.
 *
 * ⚠️ FICA FECHADO ATÉ ALGUÉM PEDIR, e não é enfeite.
 *
 * Esta é a única ação do painel que concede acesso pago de graça. Um seletor
 * sempre aberto na tela do aluno convida ao clique errado, e o erro só apareceo
 * no relatório financeiro semanas depois.
 */
export function PlanOverrideForm({
  userId,
  currentPlanName,
  plans,
}: {
  userId: string;
  currentPlanName: string | null;
  plans: Array<{ code: string; name: string; hasPrice: boolean }>;
}) {
  const [estado, dispatch] = useActionState(setPlanAction, INICIAL);
  const [pending, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);

  /*
    ⚠️ A ação é chamada do `onSubmit`, e não por `action={}`.

    O React 19 limpa um formulário que ele governa assim que a ação termina,
    inclusive quando ela RECUSA — e a recusa aqui é frequente ("já está neste
    plano", "cancele no Mercado Pago antes"). Sem isto, a observação digitada
    sumia junto com o aviso.
  */
  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => dispatch(dados));
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Alterar plano manualmente
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={userId} />

      <p className="text-sm text-pretty text-muted-foreground">
        Plano atual: <strong className="text-foreground">{currentPlanName ?? "sem plano"}</strong>.
        A troca vale na hora e não gera cobrança.
      </p>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Novo plano</span>
        <select name="planCode" className={CLASSE_CAMPO} defaultValue="">
          <option value="" disabled>
            Escolha
          </option>
          {plans.map((plano) => (
            <option key={plano.code} value={plano.code}>
              {plano.name}
              {plano.hasPrice ? " (pago)" : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Motivo</span>
        <span className="-mt-1 text-xs text-muted-foreground">
          Fica registrado com o seu nome e a data. Ajuda a lembrar daqui a seis
          meses por que esta conta tem plano pago sem pagamento.
        </span>
        <input
          name="note"
          placeholder="Cortesia, teste, parceria…"
          className={CLASSE_CAMPO}
        />
      </label>

      {estado.message ? (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-sm ${
            estado.ok ? "bg-primary/10 text-foreground" : "bg-destructive/10 text-destructive"
          }`}
        >
          {estado.message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Alterando…" : "Alterar plano"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground"
        >
          Fechar
        </button>
      </div>
    </form>
  );
}
