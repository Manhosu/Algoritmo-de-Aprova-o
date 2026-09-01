import { ENGINE_CONFIG_DEFAULTS, type EngineConfigKind } from "./schemas";

/**
 * FORMULÁRIO DO PAINEL → PAYLOAD DE CONFIGURAÇÃO.
 * ============================================================================
 *
 * ⚠️ LÊ SÓ OS CAMPOS QUE O PADRÃO DECLARA — nunca varre o `FormData` inteiro.
 *
 * A primeira versão percorria todas as entradas e pulava só `note`. Passou em
 * toda leitura de tela e falhou no primeiro envio real, em produção:
 *
 *     "{"id":"70b2947…","bound":"$@1"}" não é um número.
 *
 * O React injeta os próprios campos no formulário de uma Server Action ligada
 * (`$ACTION_REF_*`, `$ACTION_*`), e eles chegam ao `FormData` junto com os
 * meus. Varrer tudo é tentar converter a plumbagem do framework em número.
 *
 * Partir dos padrões inverte a lógica: a configuração declara quais campos
 * existem, e o que não estiver na lista é ignorado — venha do React ou de
 * qualquer coisa que alguém acrescente ao formulário depois.
 *
 * Fica em `modules/` porque é puro: dá para testar o caso do `$ACTION_REF_1`
 * sem banco, sem sessão e sem servidor, que é exatamente o que faltava.
 */

export type FormPayloadResult =
  | { ok: true; payload: Record<string, number> }
  | { ok: false; message: string };

export function engineFormPayload(
  kind: EngineConfigKind,
  formData: FormData,
): FormPayloadResult {
  const padrao = ENGINE_CONFIG_DEFAULTS[kind] as Record<string, unknown>;
  const payload: Record<string, number> = {};

  for (const [chave, valorPadrao] of Object.entries(padrao)) {
    /*
      O formulário do painel só edita configuração PLANA de números. Quando
      chegar a hora de editar `preparation_index` (que tem faixas aninhadas), o
      formulário e esta função precisam ganhar tratamento próprio — e é melhor
      recusar aqui, alto, do que gravar meia configuração.
    */
    if (typeof valorPadrao !== "number") {
      return {
        ok: false,
        message: `O campo "${chave}" não é um número simples e este formulário ainda não sabe editá-lo.`,
      };
    }

    const bruto = formData.get(chave);
    if (typeof bruto !== "string" || bruto.trim() === "") {
      return { ok: false, message: `O campo "${chave}" veio vazio.` };
    }

    // Vírgula decimal: quem digita "0,5" em pt-BR está certo, e Number() não é.
    const numero = Number(bruto.replace(",", "."));
    if (Number.isNaN(numero)) {
      return { ok: false, message: `"${bruto}" não é um número.` };
    }

    payload[chave] = numero;
  }

  return { ok: true, payload };
}
