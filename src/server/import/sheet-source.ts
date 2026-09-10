import "server-only";

import { enderecosDeDownload, idDoGoogle, nomeDoArquivo } from "./google-link";
import { COMO_EXPORTAR_XLSX, ehArquivoXlsx } from "./xlsx";

/**
 * DE ONDE VEM A PLANILHA: O ARQUIVO ESCOLHIDO OU O LINK DO GOOGLE DRIVE.
 * ============================================================================
 *
 * As três importações do painel (questões, materiais e flashcards) leem daqui.
 * Uma regra só para as três: o arquivo manda quando existe; sem arquivo, vale o
 * link. Ver a nota em `google-link.ts` sobre por que o link existe.
 */

/**
 * O teto de tamanho da planilha.
 *
 * ⚠️ NÃO É ARBITRÁRIO: Server Actions do Next têm um limite de corpo, e acima
 * dele a requisição morre com um erro de framework que não diz nada a quem
 * enviou. A planilha de 940 questões da cliente tem 300 KB. 8 MB é folga de 25
 * vezes.
 */
const TAMANHO_MAXIMO = 8 * 1024 * 1024;

/**
 * Tempo por tentativa de download.
 *
 * Uma Planilha Google pequena exporta em um ou dois segundos. O teto fica
 * abaixo do limite de execução da função na Vercel, para a mensagem sair daqui
 * em vez de a requisição inteira morrer calada.
 */
const TEMPO_POR_TENTATIVA = 8_000;

const LINK_SEM_ACESSO =
  "Não consegui baixar a planilha por esse link. No Google Drive, toque em " +
  "Compartilhar → Acesso geral → “Qualquer pessoa com o link” e tente de novo.";

export type PlanilhaLida =
  | { ok: true; bytes: Uint8Array; fileName: string }
  | { ok: false; message: string };

export async function lerPlanilha(formData: FormData): Promise<PlanilhaLida> {
  const arquivo = formData.get("sheet");

  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.size > TAMANHO_MAXIMO) return grandeDemais(arquivo.size);

    /*
      ⚠️ CONFERE OS BYTES, e não a extensão do nome. Arquivo escolhido pelo
      Google Drive chega sem extensão. Ver a nota em `ehArquivoXlsx`.
    */
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    if (!ehArquivoXlsx(bytes)) return { ok: false, message: COMO_EXPORTAR_XLSX };

    return { ok: true, bytes, fileName: arquivo.name };
  }

  const link = formData.get("link");
  if (typeof link === "string" && link.trim()) return baixarDoGoogle(link);

  return { ok: false, message: "Escolha a planilha ou cole o link dela no Google Drive." };
}

async function baixarDoGoogle(link: string): Promise<PlanilhaLida> {
  const id = idDoGoogle(link);

  if (!id) {
    return {
      ok: false,
      message:
        "Esse link não aponta para uma planilha do Google Drive. Abra a planilha " +
        "(não a pasta), toque nos três pontinhos → Compartilhar → Copiar link, e " +
        "cole aqui.",
    };
  }

  for (const endereco of enderecosDeDownload(id)) {
    let resposta: Response;

    try {
      resposta = await fetch(endereco, {
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(TEMPO_POR_TENTATIVA),
      });
    } catch {
      continue;
    }

    if (!resposta.ok) continue;

    const declarado = Number(resposta.headers.get("content-length") ?? 0);
    if (declarado > TAMANHO_MAXIMO) return grandeDemais(declarado);

    const bytes = new Uint8Array(await resposta.arrayBuffer());
    if (bytes.length > TAMANHO_MAXIMO) return grandeDemais(bytes.length);

    /*
      ⚠️ PLANILHA PRIVADA NÃO DÁ ERRO: DÁ UMA PÁGINA DE LOGIN, com status 200.

      É HTML, não planilha. Sem esta checagem, a página de login do Google
      chegaria ao leitor de xlsx e a mensagem seria "planilha corrompida" — que
      manda a cliente consertar um arquivo que está perfeito.
    */
    if (!ehArquivoXlsx(bytes)) continue;

    return {
      ok: true,
      bytes,
      fileName: nomeDoArquivo(resposta.headers.get("content-disposition"), id),
    };
  }

  return { ok: false, message: LINK_SEM_ACESSO };
}

function grandeDemais(bytes: number): PlanilhaLida {
  const mb = (bytes / 1024 / 1024).toFixed(1);
  return {
    ok: false,
    message: `A planilha tem ${mb} MB e o limite é 8 MB. Divida em partes menores.`,
  };
}
