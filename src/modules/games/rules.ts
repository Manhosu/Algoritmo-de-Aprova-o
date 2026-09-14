/**
 * AS REGRAS DOS JOGOS: QUAL LINK ENTRA E QUEM PODE JOGAR.
 * ============================================================================
 *
 * Funções puras; o servidor e o painel decidem por aqui.
 */

/**
 * ⚠️ SÓ JOGO PUBLICADO NO LOVABLE, por enquanto.
 *
 * O jogo abre DENTRO do site, e o navegador só deixa uma página embutir outra
 * de um endereço que o nosso CSP autoriza em `frame-src`. Hoje a autorização é
 * `https://*.lovable.app`, onde a cliente cria os jogos. Aceitar qualquer link
 * aqui cadastraria jogos que abririam como um quadro em branco — o navegador
 * bloqueia sem mensagem. Outro endereço é uma linha no `proxy.ts`, e ela avisa.
 */
const DOMINIO_DOS_JOGOS = ".lovable.app";

export type LinkDoJogo = { ok: true; url: string } | { ok: false; message: string };

export function validarLinkDoJogo(texto: string): LinkDoJogo {
  let url: URL;
  try {
    url = new URL(texto.trim());
  } catch {
    return { ok: false, message: "Cole o link completo do jogo, começando com https://" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, message: "O link do jogo precisa começar com https://" };
  }

  const host = url.hostname.toLowerCase();
  if (!host.endsWith(DOMINIO_DOS_JOGOS) || host === DOMINIO_DOS_JOGOS.slice(1)) {
    return {
      ok: false,
      message:
        "Por enquanto o site abre jogos publicados no Lovable, com endereço " +
        "terminando em lovable.app. Para outro endereço, fale com o Eduardo.",
    };
  }

  return { ok: true, url: url.toString() };
}

/**
 * O aluno pode abrir o jogo?
 *
 * Os planos são comparados pela ORDEM de exibição (`plans.sortOrder`): gratuito,
 * intermediário, premium. Jogo sem plano mínimo é de todos.
 */
export function podeJogar(
  ordemDoPlanoDoAluno: number | null,
  ordemDoPlanoMinimo: number | null,
): boolean {
  if (ordemDoPlanoMinimo === null) return true;
  if (ordemDoPlanoDoAluno === null) return false;
  return ordemDoPlanoDoAluno >= ordemDoPlanoMinimo;
}
