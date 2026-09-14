"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { FileUploadField } from "./file-upload-field";
import { deleteGameAction, saveGameAction, type GameFormState } from "./game-actions";

const ENTRADA =
  "h-11 w-full rounded-lg border border-input bg-input px-3 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const INICIAL: GameFormState = { ok: false };

type JogoEmEdicao = {
  id: string;
  title: string;
  description: string | null;
  gameUrl: string;
  imageStoragePath: string | null;
  minPlanId: string | null;
  isPublished: boolean;
};

/**
 * Cadastro de jogo (pedido da cliente em 14/09/2026): Nome do jogo, Breve
 * descrição, Imagem ilustrativa, Link do jogo e Plano.
 *
 * ⚠️ A AÇÃO É CHAMADA DE DENTRO DO `onSubmit`, e não por `action={}`: o React 19
 * limpa o formulário mesmo quando o servidor recusa, e um link errado apagaria
 * o nome e a descrição que ela acabou de digitar.
 */
export function GameForm({
  planos,
  jogo,
}: {
  planos: Array<{ id: string; name: string }>;
  /** Presente quando o formulário está editando um jogo que já existe. */
  jogo: JogoEmEdicao | null;
}) {
  const router = useRouter();
  const [estado, dispatch] = useActionState(saveGameAction, INICIAL);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!estado.ok) return;
    /* Editando, volta para a lista limpa; criando, o formulário recomeça do zero. */
    if (jogo) router.replace("/admin/jogos");
    else formRef.current?.reset();
  }, [estado, jogo, router]);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => dispatch(dados));
  }

  return (
    <form ref={formRef} onSubmit={enviar} className="flex flex-col gap-4" key={jogo?.id ?? "novo"}>
      {jogo ? <input type="hidden" name="id" value={jogo.id} /> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="game-title">Nome do jogo</Label>
        <input
          id="game-title"
          name="title"
          required
          maxLength={120}
          defaultValue={jogo?.title ?? ""}
          placeholder="ex.: Conexões Neurais"
          className={ENTRADA}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="game-description">Breve descrição</Label>
        <textarea
          id="game-description"
          name="description"
          rows={2}
          defaultValue={jogo?.description ?? ""}
          placeholder="O que o aluno faz no jogo."
          className={cn(ENTRADA, "h-auto py-2")}
        />
      </div>

      <FileUploadField
        name="imageStoragePath"
        label="Imagem ilustrativa"
        hint="PNG ou JPG. Aparece no cartão do jogo."
        folder="jogos"
        accept="image/png,image/jpeg"
        defaultValue={jogo?.imageStoragePath ?? undefined}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="game-url">Link do jogo</Label>
        <input
          id="game-url"
          name="gameUrl"
          type="url"
          inputMode="url"
          required
          defaultValue={jogo?.gameUrl ?? ""}
          placeholder="https://seu-jogo.lovable.app/"
          className={ENTRADA}
        />
        <p className="text-xs text-pretty text-muted-foreground">
          O endereço do jogo publicado no Lovable. Ele abre dentro do site, numa
          janela com botão de tela cheia.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="game-plan">Plano</Label>
        <select
          id="game-plan"
          name="minPlanId"
          defaultValue={jogo?.minPlanId ?? ""}
          className={cn(ENTRADA, "[&>option]:bg-card [&>option]:text-foreground")}
        >
          <option value="">Todos os planos</option>
          {planos.map((plano) => (
            <option key={plano.id} value={plano.id}>
              {plano.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-pretty text-muted-foreground">
          Quem está no plano escolhido, ou num plano acima, consegue jogar. Os outros
          veem o cartão com o nome do plano que libera o jogo.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="isPublished"
          defaultChecked={jogo?.isPublished ?? true}
          className="size-4 accent-[var(--primary)]"
        />
        Visível para os alunos
      </label>

      {estado.message ? (
        <p
          role="status"
          className={cn(
            "rounded-lg border px-3 py-2.5 text-sm text-pretty",
            estado.ok
              ? "border-success/40 bg-success/10 text-foreground"
              : "border-destructive/40 bg-destructive/10 text-foreground",
          )}
        >
          {estado.message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {jogo ? "Salvar alterações" : "Cadastrar jogo"}
        </Button>
        {jogo ? (
          <Button type="button" variant="ghost" onClick={() => router.replace("/admin/jogos")}>
            Cancelar edição
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** "Excluir", com um passo de confirmação: o cartão some da tela dos alunos. */
export function ExcluirJogo({ id, title }: { id: string; title: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, dispatch] = useActionState(deleteGameAction, INICIAL);
  const [pending, startTransition] = useTransition();

  if (!confirmando) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmando(true)}>
        Excluir
      </Button>
    );
  }

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        const dados = new FormData(evento.currentTarget);
        startTransition(() => dispatch(dados));
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <span className="text-xs text-pretty text-muted-foreground">Excluir “{title}”?</span>
      <Button type="submit" size="sm" variant="destructive" disabled={pending || estado.ok}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Sim, excluir
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmando(false)}>
        Não
      </Button>
    </form>
  );
}
