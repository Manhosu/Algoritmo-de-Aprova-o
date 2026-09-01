import { describe, expect, it } from "vitest";

import { engineFormPayload } from "./form-payload";
import { DEFAULT_DAILY_TASK_WEIGHTS, DEFAULT_XP_VALUES } from "./schemas";

function form(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) fd.append(chave, valor);
  return fd;
}

const PESOS_VALIDOS = {
  performance: "30",
  editalWeight: "20",
  urgency: "20",
  recency: "15",
  knowledgeGap: "15",
};

describe("engineFormPayload", () => {
  it("lê os cinco pesos do formulário", () => {
    const resultado = engineFormPayload("daily_task_weights", form(PESOS_VALIDOS));

    expect(resultado).toEqual({ ok: true, payload: DEFAULT_DAILY_TASK_WEIGHTS });
  });

  it("IGNORA os campos internos que o React injeta na Server Action", () => {
    /*
      ⚠️ ESTE É O TESTE QUE FALTAVA.

      A versão anterior varria o FormData inteiro e pulava só "note". Passou em
      toda leitura de tela e quebrou no primeiro envio real, em produção, com
      «"{"id":"70b2947…","bound":"$@1"}" não é um número» — o React injeta
      $ACTION_REF_* e $ACTION_* no formulário de uma ação ligada.
    */
    const resultado = engineFormPayload(
      "daily_task_weights",
      form({
        ...PESOS_VALIDOS,
        note: "mais peso para lacunas",
        $ACTION_REF_1: "",
        "$ACTION_1:0": '{"id":"70b294723a10","bound":"$@1"}',
        "$ACTION_1:1": '[{"kind":"daily_task_weights"}]',
      }),
    );

    expect(resultado).toEqual({ ok: true, payload: DEFAULT_DAILY_TASK_WEIGHTS });
  });

  it("não deixa a anotação virar campo de configuração", () => {
    const resultado = engineFormPayload(
      "daily_task_weights",
      form({ ...PESOS_VALIDOS, note: "texto livre" }),
    );

    expect(resultado.ok && "note" in resultado.payload).toBe(false);
  });

  it("aceita vírgula decimal, porque é assim que se digita em português", () => {
    const resultado = engineFormPayload(
      "daily_task_weights",
      form({ ...PESOS_VALIDOS, recency: "15,5", knowledgeGap: "14,5" }),
    );

    expect(resultado.ok && resultado.payload.recency).toBe(15.5);
  });

  it("recusa texto que não é número", () => {
    const resultado = engineFormPayload(
      "daily_task_weights",
      form({ ...PESOS_VALIDOS, urgency: "muito" }),
    );

    expect(resultado).toEqual({ ok: false, message: '"muito" não é um número.' });
  });

  it("recusa campo faltando em vez de gravar meia configuração", () => {
    const semUrgencia = { ...PESOS_VALIDOS };
    delete (semUrgencia as Partial<typeof PESOS_VALIDOS>).urgency;

    const resultado = engineFormPayload("daily_task_weights", form(semUrgencia));

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.message).toContain("urgency");
  });

  it("lê os seis valores de XP", () => {
    const resultado = engineFormPayload(
      "xp_values",
      form({
        studyCompleted: "30",
        questionAnswered: "5",
        correctBonus: "5",
        streakDay: "20",
        dailyGoalCompleted: "50",
        reviewCompleted: "40",
      }),
    );

    expect(resultado).toEqual({ ok: true, payload: DEFAULT_XP_VALUES });
  });

  it("recusa configuração aninhada, que este formulário não sabe editar", () => {
    const resultado = engineFormPayload("preparation_index", form({}));

    expect(resultado.ok).toBe(false);
    expect(resultado.ok === false && resultado.message).toContain("weights");
  });
});
