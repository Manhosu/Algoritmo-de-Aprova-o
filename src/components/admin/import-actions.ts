"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/server/auth/guards";
import {
  runMaterialImport,
  type MaterialImportReport,
} from "@/server/import/run-material-import";
import { runQuestionImport, type ImportReport } from "@/server/import/run-question-import";

/** ⚠️ Arquivo `"use server"`: só exporta `async function`. Tipo é apagado. */

export type ImportState = {
  message?: string;
  report?: ImportReport;
};

/**
 * O teto de tamanho da planilha.
 *
 * ⚠️ NÃO É ARBITRÁRIO: Server Actions do Next têm um limite de corpo, e acima
 * dele a requisição morre com um erro de framework que não diz nada a quem
 * enviou. Recusar aqui, com o tamanho na mensagem, é a diferença entre "o
 * arquivo tem 9 MB e o limite é 8" e uma tela que simplesmente não responde.
 *
 * A planilha de 940 questões da cliente tem 300 KB. 8 MB é folga de 25 vezes.
 */
const TAMANHO_MAXIMO = 8 * 1024 * 1024;

/**
 * Importa uma planilha de questões (README 2.6, item 13 do aceite).
 *
 * ⚠️ "Conferir" e "Importar" chamam A MESMA função, e a diferença é só o
 * `dryRun`. Duas rotinas separadas divergiriam no primeiro ajuste da regra de
 * casamento, e a conferência passaria a prometer um resultado diferente do que
 * a importação entrega — que é o pior defeito possível numa tela de conferência.
 */
export async function importQuestionsAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const session = await requireAdmin();

  const arquivo = formData.get("sheet");
  const conferir = formData.get("acao") === "conferir";

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { message: "Escolha uma planilha .xlsx." };
  }

  if (arquivo.size > TAMANHO_MAXIMO) {
    const mb = (arquivo.size / 1024 / 1024).toFixed(1);
    return {
      message: `A planilha tem ${mb} MB e o limite é 8 MB. Divida em partes menores.`,
    };
  }

  if (!arquivo.name.toLowerCase().endsWith(".xlsx")) {
    return { message: "O arquivo precisa ser .xlsx (Excel)." };
  }

  try {
    const report = await runQuestionImport({
      bytes: new Uint8Array(await arquivo.arrayBuffer()),
      fileName: arquivo.name,
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
 * ⚠️ MESMA ESTRUTURA DA IMPORTAÇÃO DE QUESTÕES, de propósito.
 *
 * "Conferir" e "Importar" chamam a mesma função com `dryRun` diferente, o teto
 * de tamanho é o mesmo, e a mensagem do parser vai inteira para a tela. Duas
 * telas de importação que se comportam diferente ensinam a cliente duas coisas
 * onde deveria haver uma.
 */
export async function importMaterialsAction(
  _prev: MaterialImportState,
  formData: FormData,
): Promise<MaterialImportState> {
  await requireAdmin();

  const arquivo = formData.get("sheet");
  const conferir = formData.get("acao") === "conferir";

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { message: "Escolha uma planilha .xlsx." };
  }

  if (arquivo.size > TAMANHO_MAXIMO) {
    const mb = (arquivo.size / 1024 / 1024).toFixed(1);
    return {
      message: `A planilha tem ${mb} MB e o limite é 8 MB. Divida em partes menores.`,
    };
  }

  if (!arquivo.name.toLowerCase().endsWith(".xlsx")) {
    return { message: "O arquivo precisa ser .xlsx (Excel)." };
  }

  try {
    const report = await runMaterialImport({
      bytes: new Uint8Array(await arquivo.arrayBuffer()),
      fileName: arquivo.name,
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
