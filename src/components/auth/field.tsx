"use client";

import { AlertCircle } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Campo de formulário com rótulo, ajuda e erro — ligados por acessibilidade.
 *
 * O que este componente resolve, e que quase sempre falta quando o campo é
 * montado à mão:
 *
 *   • `aria-describedby` ligando o erro ao campo, senão o leitor de tela
 *     anuncia "e-mail, caixa de edição" e a pessoa nunca fica sabendo o que
 *     deu errado;
 *   • `aria-invalid`, que é o que faz o leitor dizer "inválido";
 *   • `role="alert"` na mensagem, para o erro ser anunciado quando aparece;
 *   • o erro em TEXTO, não só na cor da borda — quem não distingue vermelho
 *     de cinza precisa de outra pista.
 */

type FieldProps = ComponentProps<"input"> & {
  label: string;
  /** Texto de apoio permanente, tipo "mínimo de 10 caracteres". */
  hint?: ReactNode;
  /** Mensagem de erro. Presente = campo inválido. */
  error?: string | null;
};

export function Field({ label, hint, error, className, id, ...props }: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId}>{label}</Label>

      <Input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(error && "border-destructive", className)}
        {...props}
      />

      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-xs text-destructive"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Erro do formulário inteiro (credencial inválida, falha de rede).
 *
 * `role="alert"` faz o leitor de tela anunciar assim que a mensagem aparece —
 * sem isso, quem navega por teclado clica em "Entrar", nada parece acontecer, e
 * a mensagem fica invisível acima do campo focado.
 */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="text-pretty">{children}</span>
    </div>
  );
}
