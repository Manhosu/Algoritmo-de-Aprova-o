/**
 * O LINK DO GOOGLE DRIVE QUE A CLIENTE COLA, E DE ONDE BAIXAR A PLANILHA.
 * ============================================================================
 *
 * Palavras dela em 10/09/2026: "estou sem notebook essa semana, e estou
 * apanhando bastante aqui pra fazer os testes. Gostaria que os uploads de
 * planilha funcionassem para planilha no drive".
 *
 * No celular, o seletor de arquivos não entrega uma Planilha Google: ela é um
 * documento no servidor deles, não um arquivo. Colar o link resolve, porque o
 * próprio Google converte para .xlsx quando pedimos pelo endereço de exportação.
 *
 * ⚠️ O SERVIDOR NUNCA BUSCA O ENDEREÇO QUE A PESSOA COLOU.
 *
 * Daqui só sai o ID, conferido por formato, e os endereços de download são
 * montados por nós com o domínio do Google escrito no código. Buscar a URL
 * colada abriria o servidor para requisições a qualquer lugar — inclusive a
 * endereços internos da infraestrutura.
 *
 * Arquivo sem `server-only` de propósito: as funções são puras e o teste as
 * importa direto.
 */

const DOMINIOS = new Set(["docs.google.com", "drive.google.com", "drive.usercontent.google.com"]);

/** ID de arquivo do Google: letras, números, `-` e `_`, e comprido. */
const FORMATO_DO_ID = /^[A-Za-z0-9_-]{20,}$/;

/**
 * O ID da planilha, a partir do link copiado do Drive ou do Planilhas Google.
 *
 * Aceita os formatos que o botão "Copiar link" produz:
 *   docs.google.com/spreadsheets/d/ID/edit?usp=sharing
 *   docs.google.com/spreadsheets/u/0/d/ID/edit
 *   drive.google.com/file/d/ID/view?usp=drive_link
 *   drive.google.com/open?id=ID
 */
export function idDoGoogle(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || !DOMINIOS.has(url.hostname.toLowerCase())) return null;

  const noCaminho = url.pathname.match(/\/d\/([^/]+)/)?.[1];
  if (noCaminho && FORMATO_DO_ID.test(noCaminho)) return noCaminho;

  const noParametro = url.searchParams.get("id");
  if (noParametro && FORMATO_DO_ID.test(noParametro)) return noParametro;

  return null;
}

/**
 * Onde o Google entrega o arquivo, na ordem de tentativa.
 *
 * O primeiro converte uma Planilha Google em .xlsx. O segundo baixa um .xlsx
 * que foi enviado ao Drive como arquivo — esse não tem o que converter, e o
 * endereço de exportação responde erro para ele.
 */
export function enderecosDeDownload(id: string): string[] {
  if (!FORMATO_DO_ID.test(id)) return [];

  return [
    `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`,
    `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
  ];
}

/** O nome da planilha, lido do cabeçalho que o Google manda junto do arquivo. */
export function nomeDoArquivo(disposicao: string | null, id: string): string {
  const codificado = disposicao?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (codificado) {
    try {
      return decodeURIComponent(codificado);
    } catch {
      /* cai para o nome simples */
    }
  }

  const simples = disposicao?.match(/filename="([^"]+)"/i)?.[1];
  return simples ?? `planilha-${id.slice(0, 8)}.xlsx`;
}
