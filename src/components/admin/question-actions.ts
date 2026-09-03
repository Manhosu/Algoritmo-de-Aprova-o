"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/server/auth/guards";
import { deleteQuestion, saveQuestion } from "@/server/admin/question-admin";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type QuestionFormState = {
  ok: boolean;
  message?: string;
};

/**
 * Salva a edição de uma questão feita pelo painel.
 *
 * ⚠️ AS ALTERNATIVAS VÊM POR ID DECLARADO, não por varredura do `FormData`.
 *
 * O campo escondido `optionIds` diz quais alternativas existem; cada uma é lida
 * pelo próprio id. Varrer as chaves procurando um prefixo traria junto os
 * `$ACTION_REF_*` que o React injeta em formulário de Server Action ligada —
 * erro que já custou uma correção nesta base, com a mensagem
 * `"{"id":"70b2947…"}" não é um número` em produção.
 */
export async function saveQuestionAction(
  _prev: QuestionFormState,
  formData: FormData,
): Promise<QuestionFormState> {
  await requireAdmin();

  const id = texto(formData, "questionId");
  if (!id) return { ok: false, message: "Questão inválida." };

  const ids = texto(formData, "optionIds").split(",").filter(Boolean);
  if (ids.length === 0) return { ok: false, message: "A questão não tem alternativas." };

  const correta = texto(formData, "correctOptionId");

  const resultado = await saveQuestion({
    id,
    statement: texto(formData, "statement"),
    explanation: texto(formData, "explanation") || null,
    difficulty: dificuldade(texto(formData, "difficulty")),
    status: situacao(texto(formData, "status")),
    options: ids.map((idOpcao) => ({
      id: idOpcao,
      content: texto(formData, `option:${idOpcao}`),
      isCorrect: idOpcao === correta,
    })),
  });

  if (!resultado.ok) return { ok: false, message: resultado.message };

  /*
    A questão editada aparece em três lugares, e os três precisam esquecer a
    versão antiga: a lista do acervo, a própria tela de edição e o Banco de
    Questões do aluno. Sem isto a cliente corrige um erro de digitação, volta
    para a lista e vê o texto errado ainda ali.
  */
  revalidatePath("/admin/questoes/acervo");
  revalidatePath(`/admin/questoes/acervo/${id}`);
  revalidatePath("/questoes");

  return { ok: true, message: "Questão salva." };
}

/** Exclui (ou arquiva, se já respondida) e volta para a lista. */
export async function deleteQuestionAction(
  _prev: QuestionFormState,
  formData: FormData,
): Promise<QuestionFormState> {
  await requireAdmin();

  const id = texto(formData, "questionId");
  if (!id) return { ok: false, message: "Questão inválida." };

  /*
    ⚠️ Segunda confirmação, no servidor.

    O `confirm()` do navegador protege contra o clique errado, e só. Exigir a
    palavra digitada faz a exclusão precisar de uma intenção que nenhum atalho
    de teclado produz sozinho.
  */
  if (texto(formData, "confirm").toLowerCase() !== "excluir") {
    return { ok: false, message: 'Digite "excluir" para confirmar.' };
  }

  const resultado = await deleteQuestion(id);
  if (!resultado.ok) return { ok: false, message: resultado.message };

  revalidatePath("/admin/questoes/acervo");
  revalidatePath("/admin/questoes");
  revalidatePath("/questoes");

  /*
    `redirect` lança — precisa ficar FORA de try/catch e depois de tudo que
    importa. A tela da questão excluída não existe mais; ficar nela mostraria
    "questão não encontrada" logo após uma operação bem-sucedida.
  */
  redirect(
    resultado.softDeleted
      ? "/admin/questoes/acervo?aviso=arquivada"
      : "/admin/questoes/acervo?aviso=excluida",
  );
}

function texto(formData: FormData, chave: string): string {
  const valor = formData.get(chave);
  return typeof valor === "string" ? valor.trim() : "";
}

/*
  Um valor fora do enum viria de um formulário adulterado, e o Postgres o
  recusaria com um erro de tipo cru na tela. Cair no meio-termo é o que menos
  surpreende: a questão fica média e rascunho, nunca publicada por engano.
*/
function dificuldade(valor: string): "easy" | "medium" | "hard" {
  return valor === "easy" || valor === "hard" ? valor : "medium";
}

function situacao(valor: string): "draft" | "published" | "archived" {
  return valor === "published" || valor === "archived" ? valor : "draft";
}
