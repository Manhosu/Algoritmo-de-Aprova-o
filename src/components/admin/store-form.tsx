"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toSlug } from "@/modules/shared/slug";

import { saveStoreItemAction, type StoreFormState } from "./store-actions";

const ENTRADA =
  "h-11 w-full rounded-lg border border-input bg-input px-3 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * Cadastro de item da loja.
 *
 * ⚠️ O CÓDIGO É GERADO A PARTIR DO NOME, e é a chave natural do item.
 *
 * Salvar duas vezes o mesmo código atualiza em vez de duplicar — é o que torna
 * um clique duplo inofensivo. Pedir o código à mão seria pedir a quem cadastra
 * que entendesse por que ele existe; derivá-lo do nome resolve sem explicação.
 * O campo continua editável para quem quiser renomear o item sem criar outro.
 *
 * ⚠️ NENHUM CAMPO É CONTROLADO POR ESTADO REACT, e isso é o conserto de um bug.
 *
 * A primeira versão guardava nome e código em `useState`. Depois de salvar, o
 * React reseta o formulário: os campos NÃO controlados (descrição, custo,
 * estoque) voltavam ao padrão e os controlados continuavam preenchidos. Sobrava
 * um formulário meio limpo — clicar em "Salvar item" de novo regravaria o mesmo
 * código com descrição vazia e estoque ilimitado, apagando em silêncio o item
 * que tinha acabado de ser cadastrado.
 *
 * Com refs, o reset limpa tudo de uma vez, e o preenchimento automático do
 * código continua funcionando escrevendo direto no campo.
 */
export function StoreForm() {
  const [state, formAction, pending] = useActionState<StoreFormState, FormData>(
    saveStoreItemAction,
    { ok: false },
  );

  const codigoRef = useRef<HTMLInputElement>(null);
  /** Deixa de seguir o nome assim que alguém digita o código à mão. */
  const codigoEditado = useRef(false);

  return (
    <form
      action={formAction}
      onSubmit={() => {
        // O próximo item começa do zero, inclusive na regra do código.
        codigoEditado.current = false;
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nome do item</Label>
        <input
          id="name"
          name="name"
          required
          onChange={(e) => {
            if (!codigoEditado.current && codigoRef.current) {
              codigoRef.current.value = toSlug(e.target.value);
            }
          }}
          placeholder="ex.: Mentoria de 30 minutos"
          className={ENTRADA}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Descrição</Label>
        <textarea
          id="description"
          name="description"
          rows={2}
          placeholder="O que o aluno recebe."
          className={cn(ENTRADA, "h-auto py-2")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="costCoins">Custo em moedas</Label>
          <input
            id="costCoins"
            name="costCoins"
            inputMode="numeric"
            required
            defaultValue="100"
            className={ENTRADA}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stock">Estoque</Label>
          <input id="stock" name="stock" inputMode="numeric" placeholder="" className={ENTRADA} />
          <p className="text-xs text-muted-foreground">Vazio = ilimitado.</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Código</Label>
        <input
          id="code"
          name="code"
          required
          ref={codigoRef}
          onChange={(e) => {
            codigoEditado.current = true;
            /*
              Normaliza enquanto digita. Como o campo não é controlado, mexer no
              `value` move o cursor para o fim — o que só incomodaria em edição
              no meio da string, e o preço disso é bem menor que deixar entrar um
              código com acento ou espaço, que quebraria a chave natural.
            */
            e.target.value = toSlug(e.target.value);
          }}
          className={ENTRADA}
        />
        <p className="text-xs text-pretty text-muted-foreground">
          Identifica o item. Salvar com um código que já existe ATUALIZA aquele
          item em vez de criar outro.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked
          className="size-4 accent-[var(--primary)]"
        />
        Visível na loja
      </label>

      {state.message ? (
        <p
          role="status"
          className={cn(
            "rounded-lg border px-3 py-2.5 text-sm text-pretty",
            state.ok
              ? "border-success/40 bg-success/10 text-foreground"
              : "border-destructive/40 bg-destructive/10 text-foreground",
          )}
        >
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Salvar item
      </Button>
    </form>
  );
}

