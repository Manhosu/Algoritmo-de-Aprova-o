import { describe, expect, it } from "vitest";

import { nextStep, type PreparationState } from "./next-step";

/**
 * O próximo passo do aluno, que agora quatro telas consultam.
 *
 * POR QUE ESTE TESTE EXISTE
 * ----------------------------------------------------------------------------
 * A cliente clicou em Cronograma antes de subir o edital e recebeu uma tela que
 * dizia "aparece quando a preparação estiver pronta", com um botão de volta
 * para a Home. Dois cliques para descobrir que faltava um PDF. Ela chamou de
 * link quebrado, e em espírito estava certa: a tela não respondia "e agora?".
 *
 * A regra que conserta isso vale para Home, Cronograma e Revisões ao mesmo
 * tempo. Um estado esquecido aqui vira beco em três telas de uma vez.
 */

const ESTADOS = [
  "draft",
  "extracting",
  "review_pending",
  "diagnosis_pending",
  "active",
  "archived",
  "failed",
] as const satisfies ReadonlyArray<PreparationState["status"]>;

function prep(status: PreparationState["status"]): PreparationState {
  return { id: "abc-123", status };
}

describe("próximo passo do aluno", () => {
  it("manda criar a preparação quando não existe nenhuma", () => {
    const passo = nextStep(null);

    expect(passo?.href).toBe("/preparacoes/nova");
    expect(passo?.cta).toBeTruthy();
  });

  it("some quando a preparação está ativa", () => {
    // É o sinal de "pode mostrar o conteúdo de verdade". Devolver um passo aqui
    // esconderia a Tarefa do Dia de quem já terminou o onboarding.
    expect(nextStep(prep("active"))).toBeNull();
  });

  it("cobre todos os estados, sem cair em indefinido", () => {
    /**
     * ⚠️ ESTADO NOVO NO ENUM SEM CASO AQUI VIRA BECO EM TRÊS TELAS.
     *
     * `undefined` não é `null`: `null` significa "siga, está tudo pronto", e
     * qualquer coisa fora disso precisa ser um passo com destino.
     */
    for (const status of ESTADOS) {
      const passo = nextStep(prep(status));
      if (status === "active") continue;

      expect(passo, `estado ${status} sem próximo passo`).not.toBeUndefined();
      expect(passo, `estado ${status} sem próximo passo`).not.toBeNull();
      expect(passo!.href, `estado ${status} sem destino`).toMatch(/^\//);
      expect(passo!.title.length, `estado ${status} sem título`).toBeGreaterThan(0);
    }
  });

  it("leva direto ao envio do edital em rascunho e em falha", () => {
    // São os dois estados em que a ação é a mesma: entregar o PDF.
    expect(nextStep(prep("draft"))?.href).toBe("/preparacoes/abc-123/edital");
    expect(nextStep(prep("failed"))?.href).toBe("/preparacoes/abc-123/edital");
  });

  it("não oferece botão enquanto a IA lê", () => {
    // Não há nada a fazer além de esperar; um botão aqui seria um clique que
    // não muda nada, e todo clique sem efeito ensina a desconfiar da tela.
    const passo = nextStep(prep("extracting"));

    expect(passo?.cta).toBeNull();
    expect(passo?.icon).toBe("processing");
  });

  it("não manda o aluno para o edital de uma preparação encerrada", () => {
    // Seria um beco: a preparação arquivada não volta a estudar por ali.
    const passo = nextStep(prep("archived"));

    expect(passo?.href).toBe("/preparacoes");
    expect(passo?.href).not.toContain("/edital");
  });
});
