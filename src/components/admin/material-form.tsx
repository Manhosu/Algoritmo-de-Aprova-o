"use client";

import { useActionState, useState, useTransition } from "react";

import { FileUploadField } from "./file-upload-field";
import {
  archiveMaterialAction,
  saveMaterialAction,
  type MaterialFormState,
} from "./material-actions";

/**
 * CADASTRO DE UM MATERIAL.
 *
 * ⚠️ O ASSUNTO É FILTRADO PELA DISCIPLINA ESCOLHIDA, no cliente.
 *
 * O catálogo tem cerca de 200 assuntos. Uma lista com todos eles obrigaria a
 * cliente a achar "Crase" entre assuntos de Informática e de Direito
 * Constitucional, e nada impediria de gravar um assunto que não pertence à
 * disciplina — a mesma incoerência que pôs 560 questões na disciplina errada.
 */

const CLASSE_CAMPO =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm";
const CLASSE_SELECT = `${CLASSE_CAMPO} [&>option]:bg-card [&>option]:text-foreground`;

export type MaterialFormProps = {
  material?: {
    id: string;
    title: string;
    description: string | null;
    type: string;
    status: string;
    requiredAccessLevel: string;
    canonicalSubjectId: string | null;
    canonicalTopicId: string | null;
    externalUrl: string | null;
    storagePath: string | null;
  } | null;
  subjects: Array<{ id: string; name: string }>;
  topics: Array<{ id: string; name: string; subjectId: string }>;
};

const INICIAL: MaterialFormState = { ok: false };

const TIPOS: Array<[string, string]> = [
  ["study_text", "Resumo"],
  ["mind_map", "Mapa mental"],
  ["flashcard_deck", "Flashcards"],
  ["video", "Videoaula"],
  ["pdf", "PDF"],
  ["audio", "Áudio"],
  /*
    ⚠️ MIND-X É TIPO PRÓPRIO, e não uma videoaula curta.

    Ele não aparece na Biblioteca nem no bloco "Estude": mora no feed do botão
    central, em tela cheia e vertical. Cadastrar um story como "Videoaula"
    colocaria trinta segundos de dica no lugar de uma aula, e cadastrar uma aula
    como Mind-X a faria tocar em tela cheia com barra de progresso de story.
  */
  ["mindx", "Mind-X (vídeo curto)"],
];

export function MaterialForm({ material, subjects, topics }: MaterialFormProps) {
  const [estado, dispatch] = useActionState(saveMaterialAction, INICIAL);
  const [salvando, startTransition] = useTransition();
  const [disciplinaId, setDisciplinaId] = useState(material?.canonicalSubjectId ?? "");
  /*
    ⚠️ O TIPO VIROU CAMPO CONTROLADO por causa do upload.

    Quem sobe um MP4 com o seletor em "Resumo" cadastra uma videoaula que a tela
    do aluno tenta abrir como link — o card abre uma aba em branco. O arquivo
    sabe o que é; deixar o acerto por conta de quem cadastra é criar um erro
    silencioso e frequente.
  */
  const [tipo, setTipo] = useState(material?.type ?? "study_text");

  /*
    ⚠️ A AÇÃO É CHAMADA DE DENTRO DO `onSubmit`, e não por `action={}`.

    O React 19 LIMPA um formulário que ele governa pelo `action` assim que a
    ação termina — inclusive quando ela termina RECUSANDO. O efeito aqui seria
    cruel: a cliente preenche tudo, o servidor responde "precisa de disciplina",
    e cada campo volta ao valor inicial. Ela reescreveria o formulário inteiro
    para corrigir uma escolha.

    Chamando a ação daqui, o React não reseta nada e o que ela digitou continua
    na tela para o segundo clique.
  */
  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => dispatch(dados));
  }


  const assuntos = topics.filter((t) => t.subjectId === disciplinaId);

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={enviar} className="flex flex-col gap-5">
        {material ? <input type="hidden" name="materialId" value={material.id} /> : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Título</span>
          <input
            name="title"
            defaultValue={material?.title ?? ""}
            required
            className={CLASSE_CAMPO}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Descrição</span>
          <span className="-mt-1 text-xs text-muted-foreground">
            Aparece no card, abaixo do título.
          </span>
          <textarea
            name="description"
            defaultValue={material?.description ?? ""}
            rows={3}
            className={CLASSE_CAMPO}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Tipo</span>
            <select
              name="type"
              value={tipo}
              onChange={(evento) => setTipo(evento.target.value)}
              className={CLASSE_SELECT}
            >
              {TIPOS.map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Quem pode ver</span>
            <select
              name="requiredAccessLevel"
              defaultValue={material?.requiredAccessLevel ?? "limited"}
              className={CLASSE_SELECT}
            >
              <option value="limited">Todos os planos</option>
              <option value="extended">Ampliado e Completo</option>
              <option value="full">Só no Completo</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Disciplina</span>
            <select
              name="canonicalSubjectId"
              value={disciplinaId}
              onChange={(evento) => setDisciplinaId(evento.target.value)}
              className={CLASSE_SELECT}
            >
              <option value="">Sem disciplina</option>
              {subjects.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Assunto</span>
            {/*
              ⚠️ `key` amarrada à disciplina.

              Sem ela, trocar de disciplina mantém o assunto anterior selecionado
              — um assunto que já nem está na lista nova. O React remonta o campo
              quando a chave muda, e a seleção volta para "Sem assunto".
            */}
            <select
              key={disciplinaId}
              name="canonicalTopicId"
              defaultValue={material?.canonicalTopicId ?? ""}
              disabled={assuntos.length === 0}
              className={`${CLASSE_SELECT} disabled:opacity-50`}
            >
              <option value="">
                {disciplinaId ? "Sem assunto" : "Escolha a disciplina primeiro"}
              </option>
              {assuntos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/*
          ⚠️ O UPLOAD VEM PRIMEIRO, e o endereço virou a segunda opção.

          Era o contrário até 08/09/2026, e o campo de endereço não dava conta do
          caso mais importante: link de compartilhamento do Google Drive devolve
          uma PÁGINA, não o arquivo. Vídeo e áudio cadastrados assim nunca tocam.
          Quem cadastra não tem como descobrir isso pelo formulário — só abrindo
          a tela do aluno e vendo o player parado.
        */}
        <FileUploadField
          name="storagePath"
          label="Arquivo do material"
          hint="Vídeo (MP4, WebM), áudio (MP3, M4A), imagem (PNG, JPG) ou PDF. O arquivo vai para a nossa área e o aluno abre dentro do site."
          defaultValue={material?.storagePath ?? null}
          onTipoDetectado={setTipo}
        />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            Ou um endereço na internet
          </span>
          <span className="-mt-1 text-xs text-pretty text-muted-foreground">
            Serve para link de YouTube ou página externa. Não serve para vídeo do
            Google Drive: o link de compartilhamento abre a página do Drive, e o
            player do aluno não consegue tocar isso. Nesse caso, use o envio de
            arquivo acima.
          </span>
          <input
            name="externalUrl"
            type="url"
            inputMode="url"
            defaultValue={material?.externalUrl ?? ""}
            placeholder="https://"
            className={CLASSE_CAMPO}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Situação</span>
          <span className="-mt-1 text-xs text-muted-foreground">
            Rascunho não aparece para nenhum aluno.
          </span>
          <select
            name="status"
            defaultValue={material?.status ?? "draft"}
            className={`${CLASSE_SELECT} max-w-56`}
          >
            <option value="draft">Rascunho</option>
            <option value="published">Publicado</option>
            <option value="archived">Arquivado</option>
          </select>
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

        <button
          type="submit"
          disabled={salvando}
          className="self-start rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {salvando ? "Salvando…" : material ? "Salvar material" : "Cadastrar material"}
        </button>
      </form>

      {material ? <ArquivarMaterial id={material.id} /> : null}
    </div>
  );
}

/** ⚠️ Irmão do formulário de edição — HTML não aninha `<form>`. */
function ArquivarMaterial({ id }: { id: string }) {
  const [estado, arquivar, arquivando] = useActionState(archiveMaterialAction, INICIAL);
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="self-start text-sm font-medium text-destructive underline-offset-4 hover:underline"
      >
        Arquivar este material
      </button>
    );
  }

  return (
    <form
      action={arquivar}
      className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
    >
      <input type="hidden" name="materialId" value={id} />
      <p className="text-sm text-pretty text-foreground">
        O material sai da biblioteca. As revisões já agendadas e o histórico de
        quem estudou continuam de pé.
      </p>

      {estado.message ? (
        <p role="status" className="text-sm text-destructive">
          {estado.message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={arquivando}
          className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {arquivando ? "Arquivando…" : "Arquivar"}
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
