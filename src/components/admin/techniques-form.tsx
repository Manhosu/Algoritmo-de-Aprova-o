"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { StudyTechniquesConfig } from "@/modules/engine-config/schemas";

import { publishStudyTechniquesAction, type EngineFormState } from "./engine-actions";

const ENTRADA =
  "h-11 w-full rounded-lg border border-input bg-input px-3 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&>option]:bg-card [&>option]:text-foreground";

/**
 * AS TÉCNICAS DE ESTUDO NA ROTAÇÃO.
 *
 * ⚠️ ESTA TELA JÁ ERA PROMETIDA EM COMENTÁRIO E NÃO EXISTIA.
 *
 * `DEFAULT_STUDY_TECHNIQUES` diz, desde 20/08/2026: "video está desligada
 * enquanto o acervo de videoaulas não existir. Reativar é um clique no painel;
 * não precisa de deploy". O clique não existia — a configuração só era editável
 * por script. Com os 29 vídeos do Mind-X no acervo, a promessa passou a ter
 * dono.
 *
 * ⚠️ FORA DAQUI: "sempre parear com questões" e "mostrar a quantidade de
 * questões". As duas são decisões de produto, não calibração — a segunda é
 * inclusive recusada pelo schema, porque anunciar um número de questões maior
 * que o teto do plano Free é prometer o que o plano não entrega.
 */

const ROTULOS: Record<string, { rotulo: string; ajuda: string }> = {
  mind_map: { rotulo: "Mapa mental", ajuda: "Precisa do arquivo no acervo." },
  flashcard: { rotulo: "Flashcards", ajuda: "Precisa do baralho cadastrado." },
  summary: { rotulo: "Resumo", ajuda: "Precisa do arquivo no acervo." },
  video: { rotulo: "Videoaula", ajuda: "Precisa do vídeo no acervo." },
  audio: { rotulo: "Áudio", ajuda: "Precisa do áudio no acervo." },
  reading: {
    rotulo: "Leitura",
    ajuda: "Não depende do nosso acervo: o aluno lê o material dele.",
  },
  other: {
    rotulo: "Estudo livre",
    ajuda: "Não depende do nosso acervo. O aluno escolhe como estudar.",
  },
};

/** "questions" fica de fora: é a prática que acompanha todo bloco, não uma técnica. */
const ESCOLHIVEIS = ["mind_map", "flashcard", "summary", "video", "audio", "reading", "other"];

export function TechniquesForm({ atual }: { atual: StudyTechniquesConfig }) {
  const [state, dispatch] = useActionState<EngineFormState, FormData>(
    publishStudyTechniquesAction,
    { ok: false },
  );

  const [pending, startTransition] = useTransition();

  /*
    ⚠️ O PADRÃO PRECISA ESTAR ENTRE AS LIGADAS — é regra do schema.

    Mantendo a lista de ligadas em estado, o menu de padrão só oferece o que
    está marcado. Sem isso, a cliente desmarcaria "Leitura" com ela ainda
    selecionada como padrão e receberia uma recusa que a tela poderia ter
    evitado.
  */
  const [ligadas, setLigadas] = useState<string[]>(atual.enabled);

  function alternar(tecnica: string) {
    setLigadas((atuais) =>
      atuais.includes(tecnica)
        ? atuais.filter((t) => t !== tecnica)
        : [...atuais, tecnica],
    );
  }

  /* Ver a nota em `ReviewIntervalsForm` sobre `onSubmit` e o reset do React 19. */
  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => dispatch(dados));
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">
          Técnicas na rotação
        </legend>

        {ESCOLHIVEIS.map((tecnica) => (
          <label key={tecnica} className="flex items-start gap-3">
            <input
              type="checkbox"
              name="enabled"
              value={tecnica}
              checked={ligadas.includes(tecnica)}
              onChange={() => alternar(tecnica)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
            />
            <span className="min-w-0">
              <span className="block text-sm text-foreground">
                {ROTULOS[tecnica].rotulo}
              </span>
              <span className="block text-xs text-pretty text-muted-foreground">
                {ROTULOS[tecnica].ajuda}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fallback">Quando não houver material do assunto</Label>
        <select
          id="fallback"
          name="fallback"
          defaultValue={atual.fallback}
          className={ENTRADA}
        >
          {ESCOLHIVEIS.filter((t) => ligadas.includes(t)).map((tecnica) => (
            <option key={tecnica} value={tecnica}>
              {ROTULOS[tecnica].rotulo}
            </option>
          ))}
        </select>
        <p className="text-xs text-pretty text-muted-foreground">
          É o modo que aparece na tarefa quando o assunto não tem material nosso.
          Escolher uma técnica que É conteúdo nosso faz a tarefa ficar sem modo
          nenhum nesses assuntos — Leitura e Estudo livre não têm esse problema.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="minAttempts">Questões para medir a técnica</Label>
          <input
            id="minAttempts"
            name="minAttemptsForTechniqueStats"
            inputMode="numeric"
            required
            defaultValue={atual.minAttemptsForTechniqueStats}
            className={ENTRADA}
          />
          <p className="text-xs text-pretty text-muted-foreground">
            Quantas questões cada técnica precisa acumular para entrar na conta
            da Melhor Técnica. Baixo demais, o card coroa uma técnica por sorte.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="minSessions">Sessões antes de repetir a técnica</Label>
          <input
            id="minSessions"
            name="minSessionsBeforeRepeat"
            inputMode="numeric"
            required
            defaultValue={atual.minSessionsBeforeRepeat}
            className={ENTRADA}
          />
          <p className="text-xs text-pretty text-muted-foreground">
            Quantas vezes o mesmo assunto precisa passar antes de repetir a mesma
            técnica. É o que faz a comparação medir a técnica, e não o assunto.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note-tecnicas">Anotação desta versão</Label>
        <input
          id="note-tecnicas"
          name="note"
          placeholder="ex.: liguei videoaula, agora que há vídeo no acervo"
          className={ENTRADA}
        />
      </div>

      {state.message ? (
        <div
          role="status"
          className={cn(
            "rounded-lg border px-3 py-2.5 text-sm",
            state.ok
              ? "border-success/40 bg-success/10 text-foreground"
              : "border-destructive/40 bg-destructive/10 text-foreground",
          )}
        >
          <p className="text-pretty">{state.message}</p>
          {state.problems?.length ? (
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs">
              {state.problems.map((problema) => (
                <li key={problema} className="text-pretty">
                  {problema}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Publicar
      </Button>
    </form>
  );
}
