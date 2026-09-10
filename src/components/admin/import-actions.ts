"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/server/auth/guards";
import {
  runFlashcardImport,
  type FlashcardImportReport,
} from "@/server/import/run-flashcard-import";
import {
  runMaterialImport,
  type MaterialImportReport,
} from "@/server/import/run-material-import";
import { runQuestionImport, type ImportReport } from "@/server/import/run-question-import";
import { lerPlanilha } from "@/server/import/sheet-source";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type ImportState = {
  message?: string;
  report?: ImportReport;
};

/**
 * Importa uma planilha de questões (README 2.6, item 13 do aceite).
 *
 * ⚠️ "Conferir" e "Importar" chamam A MESMA função, e a diferença é só o
 * `dryRun`. Duas rotinas separadas divergiriam no primeiro ajuste da regra de
 * casamento, e a conferência passaria a prometer um resultado diferente do que
 * a importação entrega — que é o pior defeito possível numa tela de conferência.
 *
 * A planilha vem do arquivo escolhido ou do link do Google Drive — ver
 * `lerPlanilha`. As três importações leem pelo mesmo caminho.
 */
export async function importQuestionsAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const session = await requireAdmin();
  const conferir = formData.get("acao") === "conferir";

  const planilha = await lerPlanilha(formData);
  if (!planilha.ok) return { message: planilha.message };

  try {
    const report = await runQuestionImport({
      bytes: planilha.bytes,
      fileName: planilha.fileName,
      uploadedByUserId: session.user.id,
      dryRun: conferir,
    });

    if (!conferir) {
      revalidatePath("/admin/questoes");
      revalidatePath("/admin");
    }

    return { report };
  } catch (erro) {
    /*
      O parser lança em planilha corrompida ou com cabeçalho fora do padrão. A
      mensagem dele é escrita para quem montou a planilha, então vai inteira
      para a tela em vez de virar "erro interno".
    */
    return {
      message: erro instanceof Error ? erro.message : "Não consegui ler a planilha.",
    };
  }
}

export type MaterialImportState = {
  message?: string;
  report?: MaterialImportReport;
};

/**
 * Importa uma planilha de materiais.
 *
 * ⚠️ MESMA ESTRUTURA DA IMPORTAÇÃO DE QUESTÕES, de propósito. Duas telas de
 * importação que se comportam diferente ensinam a cliente duas coisas onde
 * deveria haver uma.
 */
export async function importMaterialsAction(
  _prev: MaterialImportState,
  formData: FormData,
): Promise<MaterialImportState> {
  await requireAdmin();
  const conferir = formData.get("acao") === "conferir";

  const planilha = await lerPlanilha(formData);
  if (!planilha.ok) return { message: planilha.message };

  try {
    const report = await runMaterialImport({
      bytes: planilha.bytes,
      fileName: planilha.fileName,
      dryRun: conferir,
    });

    if (!conferir) {
      revalidatePath("/admin/materiais");
      /* A biblioteca do aluno e o card do Acervo leem a mesma tabela. */
      revalidatePath("/estudos");
      revalidatePath("/inicio");
    }

    return { report };
  } catch (erro) {
    return {
      message: erro instanceof Error ? erro.message : "Não consegui ler a planilha.",
    };
  }
}

export type FlashcardImportState = {
  message?: string;
  report?: FlashcardImportReport;
};

/**
 * Importa uma planilha de baralhos de flashcards.
 *
 * ⚠️ MESMA ESTRUTURA DAS OUTRAS DUAS IMPORTAÇÕES, de propósito.
 */
export async function importFlashcardsAction(
  _prev: FlashcardImportState,
  formData: FormData,
): Promise<FlashcardImportState> {
  await requireAdmin();
  const conferir = formData.get("acao") === "conferir";

  const planilha = await lerPlanilha(formData);
  if (!planilha.ok) return { message: planilha.message };

  try {
    const report = await runFlashcardImport({
      bytes: planilha.bytes,
      fileName: planilha.fileName,
      dryRun: conferir,
    });

    if (!conferir) {
      revalidatePath("/admin/materiais");
      /* A biblioteca do aluno e o card do Acervo leem a mesma tabela. */
      revalidatePath("/estudos");
      revalidatePath("/inicio");
    }

    return { report };
  } catch (erro) {
    return {
      message: erro instanceof Error ? erro.message : "Não consegui ler a planilha.",
    };
  }
}
