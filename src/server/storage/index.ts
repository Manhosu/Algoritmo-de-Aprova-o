import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
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

/** Os tipos que o acervo aceita hoje. */
export type ContentMimeType = "image/png" | "image/jpeg" | "application/pdf";

export async function putContentFile(input: {
  contentItemId: string;
  mimeType: ContentMimeType;
  bytes: Uint8Array;
}): Promise<StoredFile> {
  assertStorageReady();

  const extension =
    input.mimeType === "application/pdf" ? "pdf" : input.mimeType === "image/png" ? "png" : "jpg";
  const storagePath = `${input.contentItemId}.${extension}`;

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
