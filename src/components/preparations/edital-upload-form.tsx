"use client";

import { FileText, Loader2, UploadCloud, X } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import { FormError } from "@/components/auth/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { uploadEditalAction, type EditalUploadState } from "./edital-actions";

const INITIAL: EditalUploadState = { status: "idle" };

/** Espelha `MAX_EDITAL_BYTES` do servidor, só para avisar antes de enviar. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Envio do PDF do edital.
 *
 * A área aceita ARRASTAR e também abre o seletor no clique. No celular o
 * arrastar não existe, então o clique precisa funcionar na área inteira — não
 * só num link discreto embaixo.
 *
 * A validação daqui é cortesia, não garantia: assinatura do arquivo, tamanho e
 * dono da preparação são verificados de novo no servidor. Aqui ela existe para
 * evitar que alguém espere trinta segundos de upload para descobrir que mandou
 * um `.docx`.
 */
export function EditalUploadForm({
  preparationId,
  retry = false,
}: {
  preparationId: string;
  retry?: boolean;
}) {
  const [state, formAction, pending] = useActionState(uploadEditalAction, INITIAL);
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  /*
    Controlado porque o botão depende do tamanho: "Ler o conteúdo colado" só
    habilita quando há texto suficiente, e o aviso de quanto falta acompanha a
    digitação.
  */
  const [conteudo, setConteudo] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function accept(candidate: File | null | undefined) {
    if (!candidate) return;

    if (candidate.size > MAX_BYTES) {
      setLocalError(
        `O arquivo tem ${(candidate.size / (1024 * 1024)).toFixed(1)} MB e o limite é 25 MB.`,
      );
      setFile(null);
      return;
    }

    // Checagem por extensão E por tipo declarado. Nenhuma das duas prova nada —
    // quem prova é a assinatura conferida no servidor.
    const looksPdf =
      candidate.type === "application/pdf" || /\.pdf$/i.test(candidate.name);
    if (!looksPdf) {
      setLocalError("Envie o edital em PDF, como sai do site da banca.");
      setFile(null);
      return;
    }

    setLocalError(null);
    setFile(candidate);
  }

  const error = localError ?? (state.status === "error" ? state.message : null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="preparacaoId" value={preparationId} />

      {error ? <FormError>{error}</FormError> : null}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = event.dataTransfer.files?.[0];
          accept(dropped);
          // O input é a fonte da verdade do formulário: sem isto, o arquivo
          // arrastado apareceria na tela e não seria enviado.
          if (dropped && inputRef.current) {
            inputRef.current.files = event.dataTransfer.files;
          }
        }}
        className={cn(
          "rounded-2xl border-2 border-dashed transition-colors",
          dragging ? "border-primary bg-primary-soft" : "border-border bg-surface/40",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          name="arquivo"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(event) => accept(event.target.files?.[0])}
        />

        {file ? (
          <div className="flex items-center gap-3 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <FileText className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {file.name}
              </span>
              <span className="block text-xs text-muted-foreground">
                {(file.size / (1024 * 1024)).toFixed(1)} MB
              </span>
            </span>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label="Remover arquivo"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 px-6 py-10 text-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <UploadCloud className="size-8 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium text-foreground">
              Toque para escolher o PDF
            </span>
            <span className="text-xs text-muted-foreground">
              ou arraste o arquivo até aqui · até 25 MB
            </span>
          </button>
        )}
      </div>

      {/*
        ⚠️ COLAR O CONTEÚDO É A SEGUNDA ENTRADA (pedido da cliente em 02/09/2026).

        Palavras dela: "Envie o Edital OU Cole aqui o conteúdo que vai cair na
        sua prova", e "mesmo que o texto venha desorganizado, com números de
        páginas, cabeçalhos, rodapés, quebras de linha, caracteres incorretos".

        O campo aceita o texto sujo de propósito: limpar é trabalho da IA, que
        já faz isso hoje com o texto que extraímos do PDF.
      */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" aria-hidden />
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            ou cole o conteúdo
          </span>
          <span className="h-px flex-1 bg-border" aria-hidden />
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="sr-only">Conteúdo programático</span>
          <textarea
            name="conteudo"
            rows={6}
            value={conteudo}
            onChange={(evento) => setConteudo(evento.target.value)}
            placeholder="Cole aqui o conteúdo que vai cair na sua prova. Pode colar do jeito que veio do PDF, com números de página e cabeçalhos — a gente organiza."
            className="rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </label>

        {conteudo.trim().length > 0 && conteudo.trim().length < 200 ? (
          <p className="text-xs text-muted-foreground">
            Faltam {200 - conteudo.trim().length} caracteres. Cole a lista de
            disciplinas e assuntos inteira.
          </p>
        ) : null}
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={pending || (file === null && conteudo.trim().length < 200)}
      >
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            Enviando…
          </>
        ) : retry ? (
          "Enviar de novo"
        ) : file ? (
          "Enviar e ler o edital"
        ) : (
          "Ler o conteúdo colado"
        )}
      </Button>
    </form>
  );
}
