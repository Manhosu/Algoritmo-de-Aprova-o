"use client";

import { Loader2, Lock } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { subscribeWithCardAction, type SubscribeState } from "./subscribe-actions";

/**
 * O CARTÃO DIGITADO NA NOSSA TELA, EM CAMPOS DO MERCADO PAGO.
 * ============================================================================
 *
 * ⚠️ EXISTE POR CAUSA DO CELULAR.
 *
 * Palavras da cliente em 10/09/2026: "estou tentando fazer a assinatura do
 * plano pelo celular e ele abre o aplicativo do Mercado Pago exigindo login ou
 * criação de conta". Quem tem o aplicativo instalado nunca via o checkout do
 * site deles: o telefone entregava o endereço ao aplicativo, e o aplicativo não
 * oferece pagar sem conta.
 *
 * ⚠️ O CARTÃO NÃO PASSA PELO NOSSO SERVIDOR.
 *
 * Número, validade e código são iframes do domínio do Mercado Pago montados
 * dentro destes quadros. O SDK deles troca tudo por um token de uso único, e só
 * o token vem para cá. É isso que mantém o site fora do escopo de quem guarda
 * dado de cartão.
 */

type CampoSeguro = {
  mount(id: string): CampoSeguro;
  unmount(): void;
};

type MercadoPagoSdk = {
  fields: {
    create(tipo: string, opcoes?: Record<string, unknown>): CampoSeguro;
    createCardToken(dados: {
      cardholderName: string;
      identificationType: string;
      identificationNumber: string;
    }): Promise<{ id: string }>;
  };
};

declare global {
  interface Window {
    MercadoPago?: new (chave: string, opcoes?: { locale?: string }) => MercadoPagoSdk;
  }
}

const SDK = "https://sdk.mercadopago.com/js/v2";

function carregarSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existente = document.querySelector<HTMLScriptElement>(`script[src="${SDK}"]`);
    const script = existente ?? Object.assign(document.createElement("script"), { src: SDK, async: true });

    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("sdk")), { once: true });

    if (!existente) document.head.appendChild(script);
  });
}

const INICIAL: SubscribeState = { ok: false };

const CLASSE_CAMPO =
  "h-11 rounded-lg border border-input bg-input px-3 text-base text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function CardCheckout({
  chavePublica,
  planCode,
  billingPeriod,
  valor,
  onCancelar,
}: {
  chavePublica: string;
  planCode: string;
  billingPeriod: "monthly" | "annual";
  /** "R$ 89,90 por mês" — vai no botão, para ninguém confirmar sem ver o valor. */
  valor: string;
  onCancelar: () => void;
}) {
  const base = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ids = { numero: `${base}-numero`, validade: `${base}-validade`, codigo: `${base}-codigo` };

  const mpRef = useRef<MercadoPagoSdk | null>(null);
  const corRef = useRef<HTMLSpanElement>(null);

  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [gerandoToken, setGerandoToken] = useState(false);

  const [estado, dispatch] = useActionState(subscribeWithCardAction, INICIAL);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let vivo = true;
    const campos: CampoSeguro[] = [];

    carregarSdk()
      .then(() => {
        if (!vivo || !window.MercadoPago) return;

        const mp = new window.MercadoPago(chavePublica, { locale: "pt-BR" });
        mpRef.current = mp;

        /*
          O iframe não herda o CSS da página. A cor sai de um elemento nosso já
          pintado pelo tema, e 16px evita que o iPhone dê zoom ao tocar no campo.
        */
        const cor = corRef.current ? getComputedStyle(corRef.current).color : undefined;
        const style = { fontSize: "16px", ...(cor ? { color: cor } : {}) };

        campos.push(
          mp.fields.create("cardNumber", { placeholder: "0000 0000 0000 0000", style }).mount(ids.numero),
          mp.fields.create("expirationDate", { placeholder: "MM/AA", style }).mount(ids.validade),
          mp.fields.create("securityCode", { placeholder: "123", style }).mount(ids.codigo),
        );

        setPronto(true);
      })
      .catch(() => {
        if (vivo) {
          setErro("Não consegui abrir o formulário do cartão. Confira a conexão e tente de novo.");
        }
      });

    return () => {
      vivo = false;
      for (const campo of campos) {
        try {
          campo.unmount();
        } catch {
          /* o iframe já saiu junto com o componente */
        }
      }
    };
  }, [chavePublica, ids.numero, ids.validade, ids.codigo]);

  async function assinar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!mpRef.current || gerandoToken || pending) return;

    const dados = new FormData(evento.currentTarget);
    const titular = String(dados.get("titular") ?? "").trim();
    const cpf = String(dados.get("cpf") ?? "").replace(/\D/g, "");

    if (titular.length < 3) return setErro("Escreva o nome como está impresso no cartão.");
    if (cpf.length !== 11) return setErro("O CPF do titular precisa ter 11 números.");

    setErro(null);
    setGerandoToken(true);

    let token: string;
    try {
      const resposta = await mpRef.current.fields.createCardToken({
        cardholderName: titular,
        identificationType: "CPF",
        identificationNumber: cpf,
      });
      token = resposta.id;
    } catch {
      setGerandoToken(false);
      return setErro("Confira o número, a validade e o código de segurança do cartão.");
    }

    setGerandoToken(false);

    /* Só o token e o plano vão ao servidor. Nome e CPF ficaram no Mercado Pago. */
    const envio = new FormData();
    envio.set("planCode", planCode);
    envio.set("billingPeriod", billingPeriod);
    envio.set("cardToken", token);

    startTransition(() => dispatch(envio));
  }

  const ocupado = gerandoToken || pending;
  const mensagem = erro ?? estado.message ?? null;

  return (
    <form onSubmit={assinar} className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left">
      <span ref={corRef} className="sr-only text-foreground" aria-hidden />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${base}-titular`}>Nome impresso no cartão</Label>
        <input id={`${base}-titular`} name="titular" autoComplete="cc-name" className={CLASSE_CAMPO} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.numero}>Número do cartão</Label>
        <div id={ids.numero} className={`${CLASSE_CAMPO} py-2.5`} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.validade}>Validade</Label>
          <div id={ids.validade} className={`${CLASSE_CAMPO} py-2.5`} />
        </div>
        <div className="flex flex-col gap-1.5">
          {/* "Código de segurança" quebrava em duas linhas a 390px e empurrava o
              quadro para baixo do da validade. */}
          <Label htmlFor={ids.codigo}>Código (CVV)</Label>
          <div id={ids.codigo} className={`${CLASSE_CAMPO} py-2.5`} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${base}-cpf`}>CPF do titular</Label>
        <input
          id={`${base}-cpf`}
          name="cpf"
          inputMode="numeric"
          autoComplete="off"
          placeholder="000.000.000-00"
          className={CLASSE_CAMPO}
        />
      </div>

      {mensagem ? (
        <p role="status" className="text-sm text-pretty text-destructive">
          {mensagem}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={!pronto || ocupado} className="w-full">
        {ocupado || !pronto ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Lock aria-hidden />}
        {!pronto ? "Abrindo formulário…" : ocupado ? "Confirmando…" : `Assinar · ${valor}`}
      </Button>

      <p className="text-xs text-pretty text-muted-foreground">
        A cobrança se repete no mesmo cartão a cada período. Os dados do cartão vão
        direto para o Mercado Pago; o site não os vê.
      </p>

      <button
        type="button"
        onClick={onCancelar}
        className="self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Voltar
      </button>
    </form>
  );
}
