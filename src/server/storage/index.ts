import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve, sep } from "node:path";

import { env } from "@/config/env";

/**
 * ONDE FICA O PDF DO EDITAL
 * ============================================================================
 *
 * O README exige que o painel administrativo tenha "acesso a todos os editais
 * enviados pelos alunos", então o arquivo precisa sobreviver ao upload — não dá
 * para ler, extrair e descartar.
 *
 * DOIS DESTINOS, ESCOLHIDOS PELO AMBIENTE
 * ----------------------------------------------------------------------------
 * • Supabase Storage, quando SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY existem.
 *   É o destino de produção: mesma infraestrutura do banco, mesma conta, mesmo
 *   backup, sem serviço novo para a cliente contratar.
 *
 * • Disco local (`.storage/`), caso contrário. É o que faz o fluxo inteiro
 *   rodar na máquina de desenvolvimento sem credencial de nuvem nenhuma.
 *
 * ⚠️ O driver local NÃO serve para produção na Vercel: lá o sistema de arquivos
 * é somente leitura fora de `/tmp`, e `/tmp` some entre invocações. Por isso
 * `assertStorageReady()` recusa subir em produção sem o Supabase configurado —
 * um upload que "funciona" e perde o arquivo depois é pior que uma falha na
 * cara.
 *
 * POR QUE NÃO O @supabase/supabase-js
 * ----------------------------------------------------------------------------
 * A API REST de Storage é um PUT com um header de autorização. O SDK inteiro,
 * com auth, realtime e postgrest embutidos, entraria no bundle do servidor para
 * substituir as trinta linhas abaixo.
 */

const BUCKET = "editais";

/**
 * O acervo da cliente: mapas mentais, resumos, futuras videoaulas.
 *
 * Bucket SEPARADO do de editais, e igualmente PRIVADO.
 *
 * Separado porque o ciclo de vida é outro: edital é dado do aluno e some com a
 * conta dele; o acervo é o ativo do produto e sobrevive a todos os alunos.
 *
 * ⚠️ PRIVADO, apesar de ser material de divulgação. Um bucket público com
 * caminho previsível é o caminho mais curto para o acervo inteiro circular em
 * grupo de mensagens — e ele é exatamente o que a cliente vende. As URLs são
 * assinadas e expiram; o caminho usa o id do item, que não é adivinhável.
 */
const CONTENT_BUCKET = "acervo";

/** Caminho do driver local. Fora do `public/`, de propósito: edital é do aluno. */
const LOCAL_ROOT = resolve(process.cwd(), ".storage");

export type StoredFile = {
  /** Valor gravado em `preparation_documents.storage_path`. */
  storagePath: string;
  sizeBytes: number;
};

export function isRemoteStorageConfigured(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Recusa um ambiente que aceitaria o upload e perderia o arquivo.
 *
 * Chamada antes de gravar, não na subida da aplicação: em desenvolvimento o
 * driver local é legítimo, e travar o boot por falta de credencial de nuvem
 * impediria de rodar o projeto localmente.
 */
export function assertStorageReady(): void {
  if (env.NODE_ENV === "production" && !isRemoteStorageConfigured()) {
    throw new Error(
      "Armazenamento de arquivos não configurado. Em produção, SUPABASE_URL e " +
        "SUPABASE_SERVICE_ROLE_KEY são obrigatórias — sem elas o PDF do edital " +
        "seria gravado num disco efêmero e sumiria.",
    );
  }
}

/* ========================================================================== *
 * ESCRITA
 * ========================================================================== */

export async function putEditalFile(input: {
  preparationId: string;
  documentId: string;
  fileName: string;
  bytes: Uint8Array;
}): Promise<StoredFile> {
  assertStorageReady();

  const storagePath = buildPath(input.preparationId, input.documentId);

  if (isRemoteStorageConfigured()) {
    await putRemote(storagePath, input.bytes);
  } else {
    await putLocal(storagePath, input.bytes);
  }

  return { storagePath, sizeBytes: input.bytes.byteLength };
}

export async function getEditalFile(storagePath: string): Promise<Uint8Array> {
  return isRemoteStorageConfigured() ? getRemote(storagePath) : getLocal(storagePath);
}

/* ========================================================================== *
 * ACERVO
 * ========================================================================== */

/**
 * Os tipos que o acervo aceita.
 *
 * ⚠️ VÍDEO E ÁUDIO ENTRARAM EM 08/09/2026, com o upload pelo painel.
 *
 * Antes o acervo só guardava imagem e PDF porque só mapa mental usava
 * armazenamento; vídeo e áudio viviam de link externo. A cliente tentou
 * cadastrar os vídeos do Mind-X com o endereço do Google Drive e não funcionou:
 * link de compartilhamento do Drive devolve uma PÁGINA, não o arquivo, e a tag
 * de vídeo do navegador não sabe o que fazer com HTML.
 */
export type ContentMimeType =
  | "image/png"
  | "image/jpeg"
  | "application/pdf"
  | "video/mp4"
  | "video/webm"
  | "audio/mpeg"
  | "audio/mp4";

/** A extensão de cada tipo, para o caminho no armazenamento. */
const EXTENSAO: Record<ContentMimeType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
};

export async function putContentFile(input: {
  contentItemId: string;
  mimeType: ContentMimeType;
  bytes: Uint8Array;
}): Promise<StoredFile> {
  assertStorageReady();

  const storagePath = `${input.contentItemId}.${EXTENSAO[input.mimeType]}`;

  if (isRemoteStorageConfigured()) {
    await putRemote(storagePath, input.bytes, {
      bucket: CONTENT_BUCKET,
      contentType: input.mimeType,
    });
  } else {
    await putLocal(`${CONTENT_BUCKET}/${storagePath}`, input.bytes);
  }

  return { storagePath, sizeBytes: input.bytes.byteLength };
}

export async function getContentFile(storagePath: string): Promise<Uint8Array> {
  return isRemoteStorageConfigured()
    ? getRemote(storagePath, CONTENT_BUCKET)
    : getLocal(`${CONTENT_BUCKET}/${storagePath}`);
}

/** Monta o caminho no bucket a partir do id do item e do tipo real do arquivo. */
export function buildContentPath(contentItemId: string, mimeType: ContentMimeType): string {
  return `${contentItemId}.${EXTENSAO[mimeType]}`;
}

/* ========================================================================== *
 * UPLOAD DIRETO
 * ========================================================================== */

/**
 * URL temporária para o NAVEGADOR gravar o arquivo direto no bucket.
 *
 * ⚠️ É O ÚNICO CAMINHO POSSÍVEL PARA VÍDEO, e o motivo é um limite de
 * infraestrutura, não uma preferência.
 *
 * Um upload que passa pelo servidor vira corpo de requisição, e a Vercel corta
 * o corpo de qualquer função em 4,5 MB — abaixo disso não há configuração que
 * ajude, porque o corte acontece antes do nosso código rodar. Os vídeos do
 * Mind-X têm de 1,7 a 10,7 MB: metade deles falharia, e falharia só em
 * produção, depois de funcionar na máquina de desenvolvimento.
 *
 * Com a URL assinada, os bytes vão do navegador da cliente para o Supabase sem
 * tocar na nossa função. A chave de serviço continua no servidor: o que chega
 * ao navegador é um token de uso único, para UM caminho, que expira.
 *
 * O caminho é derivado do id do item, nunca do nome do arquivo — o nome é
 * entrada de usuário e montaria uma travessia de diretório.
 */
export async function createContentUploadUrl(input: {
  contentItemId: string;
  mimeType: ContentMimeType;
}): Promise<{ uploadUrl: string; storagePath: string }> {
  assertStorageReady();

  const storagePath = buildContentPath(input.contentItemId, input.mimeType);

  /*
    Sem Supabase (desenvolvimento), a gravação passa pela nossa própria rota,
    que escreve em `.storage/`. O limite de corpo não incomoda aqui porque o
    servidor local é o próprio Next, sem a fronteira da Vercel no meio.
  */
  if (!isRemoteStorageConfigured()) {
    return {
      uploadUrl: `/api/acervo/upload?path=${encodeURIComponent(storagePath)}`,
      storagePath,
    };
  }

  const base = env.SUPABASE_URL!.replace(/\/+$/, "");
  const response = await fetch(
    `${base}/storage/v1/object/upload/sign/${CONTENT_BUCKET}/${storagePath}`,
    {
      method: "POST",
      headers: { ...remoteHeaders(), "Content-Type": "application/json" },
      /* Reenviar o mesmo material substitui o arquivo em vez de falhar. */
      body: JSON.stringify({ upsert: true }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Falha ao preparar o upload (${response.status}): ${await safeText(response)}`,
    );
  }

  const { url } = (await response.json()) as { url: string };
  return { uploadUrl: `${base}/storage/v1${url}`, storagePath };
}

/**
 * Lê os primeiros bytes de um arquivo já gravado.
 *
 * ⚠️ É O QUE MANTÉM A CONFERÊNCIA DE TIPO NO SERVIDOR depois do upload direto.
 *
 * Como os bytes não passam mais por nós, a checagem de assinatura precisaria
 * confiar no navegador — e o que o navegador declara como `Content-Type` é
 * literalmente um campo de texto que qualquer cliente escolhe. Um `Range` de
 * quatro quilobytes traz o cabeçalho do arquivo de volta e `identifyMedia`
 * decide o que ele é de verdade, pagando alguns kilobytes em vez do arquivo.
 */
export async function probeContentFile(storagePath: string): Promise<Uint8Array> {
  if (!isRemoteStorageConfigured()) {
    const inteiro = await getLocal(`${CONTENT_BUCKET}/${storagePath}`);
    return inteiro.slice(0, 4096);
  }

  const response = await fetch(remoteUrl(storagePath, CONTENT_BUCKET), {
    headers: { ...remoteHeaders(), Range: "bytes=0-4095" },
  });

  if (!response.ok) {
    throw new Error(
      `Falha ao conferir o arquivo (${response.status}): ${await safeText(response)}`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Apaga um arquivo do acervo.
 *
 * Existe para o caso em que a conferência recusa o que foi enviado: sem isto, o
 * arquivo recusado ficaria ocupando espaço no bucket para sempre, sem nenhuma
 * linha do banco apontando para ele.
 *
 * ⚠️ LER O ARQUIVO LOGO DEPOIS AINDA DEVOLVE O CONTEÚDO, e isso não é falha.
 *
 * O Supabase serve objeto por CDN, inclusive na rota autenticada. Um GET feito
 * antes do apagamento deixa a cópia em cache por alguns minutos, e ela continua
 * respondendo. Quem quiser CONFERIR se o arquivo sumiu precisa consultar a
 * listagem do bucket (`/object/list/<bucket>`), que é a fonte da verdade — foi
 * o que me fez perder um tempo achando que o apagamento não funcionava.
 */
export async function deleteContentFile(storagePath: string): Promise<void> {
  if (!isRemoteStorageConfigured()) {
    await rm(resolveLocal(`${CONTENT_BUCKET}/${storagePath}`), { force: true });
    return;
  }

  await fetch(remoteUrl(storagePath, CONTENT_BUCKET), {
    method: "DELETE",
    headers: remoteHeaders(),
  });
}

/** Grava um arquivo do acervo vindo da nossa própria rota (só desenvolvimento). */
export async function putContentFileLocal(
  storagePath: string,
  bytes: Uint8Array,
): Promise<void> {
  await putLocal(`${CONTENT_BUCKET}/${storagePath}`, bytes);
}

/**
 * URL temporária para o navegador do aluno buscar a imagem direto.
 *
 * Sem isto, cada mapa mental passaria pelo servidor do Next para ser servido —
 * uma imagem de 3 MB por requisição, sem CDN, cobrada como execução. A URL
 * assinada faz o Supabase entregar o arquivo, e ela expira.
 *
 * No driver local devolve a rota interna, porque não existe assinatura sem
 * Supabase — e é só desenvolvimento.
 */
export async function signContentUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  if (!isRemoteStorageConfigured()) {
    return `/api/acervo/${encodeURIComponent(storagePath)}`;
  }

  const base = env.SUPABASE_URL!.replace(/\/+$/, "");
  const response = await fetch(
    `${base}/storage/v1/object/sign/${CONTENT_BUCKET}/${storagePath}`,
    {
      method: "POST",
      headers: { ...remoteHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Falha ao assinar a URL do acervo (${response.status}): ${await safeText(response)}`,
    );
  }

  const { signedURL } = (await response.json()) as { signedURL: string };
  return `${base}/storage/v1${signedURL}`;
}

/**
 * Assina VÁRIOS caminhos numa chamada só.
 *
 * ⚠️ A LOJA MOSTRA DEZ CARDS DE UMA VEZ, e uma assinatura por card seriam dez
 * idas ao Supabase antes de a página começar a renderizar. Com a latência de
 * cada uma somando, a loja abriria visivelmente mais devagar que o resto do
 * aplicativo, e por um motivo que ninguém suspeitaria olhando a tela.
 *
 * Devolve um mapa; caminho que falhou simplesmente não entra. Quem chama trata
 * a ausência como "sem imagem", que é um card mais pobre e não uma tela de erro.
 */
export async function signContentUrls(
  storagePaths: string[],
  expiresInSeconds = 3600,
): Promise<Map<string, string>> {
  const resultado = new Map<string, string>();
  const caminhos = [...new Set(storagePaths.filter(Boolean))];

  if (caminhos.length === 0) return resultado;

  if (!isRemoteStorageConfigured()) {
    for (const caminho of caminhos) {
      resultado.set(caminho, `/api/acervo/${encodeURIComponent(caminho)}`);
    }
    return resultado;
  }

  const base = env.SUPABASE_URL!.replace(/\/+$/, "");

  try {
    const response = await fetch(`${base}/storage/v1/object/sign/${CONTENT_BUCKET}`, {
      method: "POST",
      headers: { ...remoteHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: expiresInSeconds, paths: caminhos }),
    });

    if (!response.ok) return resultado;

    const linhas = (await response.json()) as Array<{
      path: string | null;
      signedURL: string | null;
      error: string | null;
    }>;

    for (const linha of linhas) {
      if (linha.path && linha.signedURL && !linha.error) {
        resultado.set(linha.path, `${base}/storage/v1${linha.signedURL}`);
      }
    }
  } catch (erro) {
    console.error("[storage] falha ao assinar em lote", erro);
  }

  return resultado;
}

/* ========================================================================== *
 * CAMINHO
 * ========================================================================== */

/**
 * O caminho é derivado de IDs, nunca do nome que o aluno enviou.
 *
 * Nome de arquivo é entrada do usuário: `../../.env` é um nome de arquivo
 * válido. Montar caminho com ele é o caminho mais curto para uma travessia de
 * diretório. O nome original fica na coluna `file_name`, que é exibida, e não
 * usada para resolver nada.
 */
function buildPath(preparationId: string, documentId: string): string {
  return `${preparationId}/${documentId}.pdf`;
}

/** Segunda barreira: mesmo com bug de chamada, nada escapa da raiz. */
function resolveLocal(storagePath: string): string {
  const full = normalize(join(LOCAL_ROOT, storagePath));
  if (!full.startsWith(LOCAL_ROOT + sep)) {
    throw new Error("Caminho de armazenamento inválido.");
  }
  return full;
}

/* ========================================================================== *
 * DRIVER LOCAL
 * ========================================================================== */

async function putLocal(storagePath: string, bytes: Uint8Array): Promise<void> {
  const full = resolveLocal(storagePath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, bytes);
}

async function getLocal(storagePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(resolveLocal(storagePath)));
}

/* ========================================================================== *
 * DRIVER SUPABASE STORAGE
 * ========================================================================== */

function remoteUrl(storagePath: string, bucket = BUCKET): string {
  const base = env.SUPABASE_URL!.replace(/\/+$/, "");
  return `${base}/storage/v1/object/${bucket}/${storagePath}`;
}

function remoteHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
  };
}

async function putRemote(
  storagePath: string,
  bytes: Uint8Array,
  options: { bucket?: string; contentType?: string } = {},
): Promise<void> {
  const response = await fetch(remoteUrl(storagePath, options.bucket), {
    method: "POST",
    headers: {
      ...remoteHeaders(),
      "Content-Type": options.contentType ?? "application/pdf",
      // Reenviar o edital sobrescreve o arquivo do mesmo documento em vez de
      // falhar com "já existe".
      "x-upsert": "true",
    },
    body: new Blob([new Uint8Array(bytes)]),
  });

  if (!response.ok) {
    throw new Error(
      `Falha ao gravar no Storage (${response.status}): ${await safeText(response)}`,
    );
  }
}

async function getRemote(storagePath: string, bucket = BUCKET): Promise<Uint8Array> {
  const response = await fetch(remoteUrl(storagePath, bucket), { headers: remoteHeaders() });
  if (!response.ok) {
    throw new Error(
      `Falha ao ler no Storage (${response.status}): ${await safeText(response)}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return "sem detalhe";
  }
}
