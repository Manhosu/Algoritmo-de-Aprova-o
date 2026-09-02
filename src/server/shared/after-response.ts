import "server-only";

import { after } from "next/server";

/**
 * Roda um trabalho DEPOIS que a resposta chegou ao usuário.
 *
 * ⚠️ `after()` do Next só existe DENTRO de uma requisição, e LANÇA fora dela.
 *
 * `verify-engine` e `measure-answer` chamam `answerQuestion` e
 * `completeReviewOccurrence` direto, sem servidor no meio. Com `after()` cru os
 * dois quebravam com "`after` was called outside a request scope" — e são
 * justamente os scripts que provam que o funil, as moedas e as conquistas
 * funcionam.
 *
 * Com requisição, o `after` registra e volta na hora: o `await` daqui não custa
 * nada e o aluno não espera pela telemetria. Sem requisição, o trabalho roda e
 * é esperado, que é o que os scripts precisam para conferir o efeito logo
 * depois da chamada.
 *
 * ⚠️ O `fn` NÃO DEVE LANÇAR. Dentro de `after` não há tela onde o erro
 * apareceria, e fora dela ele derrubaria o script. Quem chama trata o próprio
 * erro.
 */
export async function afterResponse(fn: () => Promise<void>): Promise<void> {
  try {
    after(fn);
  } catch {
    await fn();
  }
}
