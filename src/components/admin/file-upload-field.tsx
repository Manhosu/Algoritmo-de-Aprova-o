"use client";

import { CheckCircle2, FileUp, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { megabytes, motivoDaRecusa, tipoDeclarado, tipoDeMaterialPara } from "@/modules/uploads/rules";
import { cn } from "@/lib/utils";

import { confirmUploadAction, prepareUploadAction } from "./upload-actions";

/**
 * O BOTÃO DE ENVIAR ARQUIVO (pedido da cliente em 08/09/2026).
 * ============================================================================
 *
 * ⚠️ OS BYTES NÃO PASSAM PELO NOSSO SERVIDOR, e é isso que faz vídeo funcionar.
 *
 * A Vercel corta o corpo de qualquer requisição em 4,5 MB, antes do nosso código
 * rodar. Os vídeos do Mind-X vão a 10,7 MB. Enviar por Server Action daria erro
 * só em produção, depois de funcionar perfeitamente na minha máquina.
 *
 * Então o servidor devolve uma autorização de escrita para UM caminho e o
 * navegador grava direto no armazenamento.
 *
 * ⚠️ `XMLHttpRequest`, E NÃO `fetch`.
 *
 * Não é preferência velha: `fetch` ainda não reporta progresso de UPLOAD em
 * nenhum navegador. Num arquivo de 10 MB numa conexão comum, isso são vinte
 * segundos de tela parada — tempo suficiente para a cliente concluir que travou
 * e clicar de novo.
 */

export type FileUploadFieldProps = {
  /** Nome do campo escondido que carrega o caminho para o formulário. */
  name: string;
  label: string;
  hint?: string;
  /** `loja` só aceita imagem. */
  folder?: "acervo" | "loja";
  /** Caminho já gravado, quando o material está sendo editado. */
  defaultValue?: string | null;
  /** Avisa o formulário do tipo de material que combina com o arquivo. */
  onTipoDetectado?: (tipo: string) => void;
  accept?: string;
};

type Estado =
  | { fase: "vazio" }
  | { fase: "enviando"; nome: string; percentual: number }
  | { fase: "pronto"; nome: string; caminho: string }
  | { fase: "erro"; mensagem: string };

export function FileUploadField({
  name,
  label,
  hint,
  folder = "acervo",
  defaultValue,
  onTipoDetectado,
  accept = "image/png,image/jpeg,application/pdf,video/mp4,video/webm,audio/mpeg,audio/mp4",
}: FileUploadFieldProps) {
  const [estado, setEstado] = useState<Estado>(
    defaultValue
      ? { fase: "pronto", nome: nomeDoCaminho(defaultValue), caminho: defaultValue }
      : { fase: "vazio" },
  );
  const inputRef = useRef<HTMLInputElement>(null);

  /*
    ⚠️ O CONTROLE SE LIMPA QUANDO O FORMULÁRIO É LIMPO.

    `form.reset()` limpa o DOM e não toca em estado do React. O formulário da
    loja chama `reset()` depois de gravar, para o próximo item começar do zero —
    e o arquivo enviado ficava para trás. O segundo item da loja nasceria com a
    imagem do primeiro, sem aviso nenhum, e a cliente só descobriria olhando a
    tela do aluno.

    O evento `reset` borbulha, então basta ouvi-lo. Fica aqui, e não no
    formulário, para valer em qualquer formulário que use este controle.
  */
  useEffect(() => {
    const formulario = inputRef.current?.form;
    if (!formulario) return;

    const aoLimpar = () => setEstado({ fase: "vazio" });
    formulario.addEventListener("reset", aoLimpar);
    return () => formulario.removeEventListener("reset", aoLimpar);
  }, []);

  async function enviar(arquivo: File) {
    /*
      Conferência local antes de qualquer viagem. Recusar um arquivo de 300 MB
      depois de subi-lo seria cobrar da cliente cinco minutos para dizer não.
    */
    const tipo = tipoDeclarado({ mimeType: arquivo.type, fileName: arquivo.name });
    const recusa = motivoDaRecusa({ tipo, sizeBytes: arquivo.size });

    if (recusa || !tipo) {
      setEstado({ fase: "erro", mensagem: recusa ?? "Arquivo inválido." });
      return;
    }

    setEstado({ fase: "enviando", nome: arquivo.name, percentual: 0 });

    const autorizacao = await prepareUploadAction({
      fileName: arquivo.name,
      mimeType: arquivo.type || null,
      sizeBytes: arquivo.size,
      folder,
    });

    if (!autorizacao.ok) {
      setEstado({ fase: "erro", mensagem: autorizacao.message });
      return;
    }

    try {
      await enviarComProgresso({
        url: autorizacao.uploadUrl,
        arquivo,
        contentType: autorizacao.mimeType,
        aoProgredir: (percentual) =>
          setEstado({ fase: "enviando", nome: arquivo.name, percentual }),
      });
    } catch (erro) {
      setEstado({
        fase: "erro",
        mensagem:
          erro instanceof Error && erro.message
            ? erro.message
            : "O envio falhou no meio. Confira a conexão e tente de novo.",
      });
      return;
    }

    /* O servidor confere os bytes que chegaram e apaga o que não for o formato. */
    const conferido = await confirmUploadAction({
      storagePath: autorizacao.storagePath,
      expected: autorizacao.mimeType,
    });

    if (!conferido.ok) {
      setEstado({ fase: "erro", mensagem: conferido.message });
      return;
    }

    setEstado({ fase: "pronto", nome: arquivo.name, caminho: autorizacao.storagePath });

    const tipoDeMaterial = tipoDeMaterialPara(conferido.mimeType);
    if (tipoDeMaterial) onTipoDetectado?.(tipoDeMaterial);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hint ? <span className="-mt-1 text-xs text-pretty text-muted-foreground">{hint}</span> : null}

      {/*
        O caminho só entra no formulário quando existe. Um campo com valor vazio
        apagaria o arquivo já cadastrado a cada salvamento de outro campo.
      */}
      {estado.fase === "pronto" ? (
        <input type="hidden" name={name} value={estado.caminho} />
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={folder === "loja" ? "image/png,image/jpeg" : accept}
        className="sr-only"
        onChange={(evento) => {
          const arquivo = evento.target.files?.[0];
          /* Limpa para que escolher o MESMO arquivo de novo dispare o evento. */
          evento.target.value = "";
          if (arquivo) void enviar(arquivo);
        }}
      />

      {estado.fase === "enviando" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm text-foreground">
            <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{estado.nome}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {estado.percentual}%
            </span>
          </span>
          <span className="h-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary transition-[width] duration-200"
              style={{ width: `${estado.percentual}%` }}
            />
          </span>
        </div>
      ) : null}

      {estado.fase === "pronto" ? (
        <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2.5">
          <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            {estado.nome}
          </span>
          <button
            type="button"
            onClick={() => setEstado({ fase: "vazio" })}
            aria-label="Remover arquivo"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {estado.fase === "vazio" || estado.fase === "erro" ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3",
            "text-sm font-medium transition-colors",
            estado.fase === "erro"
              ? "border-destructive/50 text-destructive"
              : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
          )}
        >
          <FileUp className="size-4 shrink-0" aria-hidden />
          Escolher arquivo
        </button>
      ) : null}

      {estado.fase === "erro" ? (
        <p role="alert" className="text-sm text-pretty text-destructive">
          {estado.mensagem}
        </p>
      ) : null}
    </div>
  );
}

/**
 * O PUT com barra de progresso.
 *
 * O Supabase aceita o arquivo direto no corpo, com o token na própria URL — não
 * há cabeçalho de autorização para vazar no navegador, e o token vale para um
 * caminho só.
 */
function enviarComProgresso(input: {
  url: string;
  arquivo: File;
  contentType: string;
  aoProgredir: (percentual: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const requisicao = new XMLHttpRequest();

    /* Rota local aceita POST; o armazenamento remoto espera PUT. */
    const metodo = input.url.startsWith("/") ? "POST" : "PUT";
    requisicao.open(metodo, input.url);
    requisicao.setRequestHeader("Content-Type", input.contentType);
    if (metodo === "PUT") requisicao.setRequestHeader("x-upsert", "true");

    requisicao.upload.addEventListener("progress", (evento) => {
      if (evento.lengthComputable) {
        input.aoProgredir(Math.round((evento.loaded / evento.total) * 100));
      }
    });

    requisicao.addEventListener("load", () => {
      if (requisicao.status >= 200 && requisicao.status < 300) resolve();
      else
        reject(
          new Error(
            `O armazenamento recusou o arquivo (${requisicao.status}). ` +
              `Se ele tem mais de ${megabytes(50 * 1024 * 1024)} MB, o limite do plano de armazenamento pode ser menor que o nosso.`,
          ),
        );
    });

    requisicao.addEventListener("error", () =>
      reject(new Error("O envio falhou no meio. Confira a conexão e tente de novo.")),
    );

    requisicao.addEventListener("abort", () => reject(new Error("Envio cancelado.")));

    requisicao.send(input.arquivo);
  });
}

/** Nome de exibição quando o material já vem com arquivo do banco. */
function nomeDoCaminho(caminho: string): string {
  return "Arquivo enviado" + (caminho.includes(".") ? ` (.${caminho.split(".").pop()})` : "");
}
