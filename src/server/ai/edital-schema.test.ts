import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";

import {
  clipExtraction,
  editalExtractionSchema,
  type EditalExtraction,
} from "./edital-schema";

/**
 * O schema do edital é o contrato com o modelo. Estes testes travam as duas
 * formas de quebrá-lo que já custaram caro de verdade.
 */

describe("editalExtractionSchema", () => {
  /**
   * ⚠️ ESTE TESTE EXISTE POR CAUSA DE UM ERRO MEU, EM 24/08/2026.
   *
   * Tentei fazer os campos se auto-cortarem com `.transform()`. `zodOutputFormat`
   * lança "Transforms cannot be represented in JSON Schema" — e ele lança na
   * MONTAGEM da requisição, antes de qualquer chamada. Resultado: a leitura de
   * edital morria inteira, e o sintoma era um "falha inesperada" que não
   * apontava para nada.
   *
   * Duas chamadas de API e dois minutos de espera para descobrir algo que este
   * teste pega em milissegundos.
   */
  it("é convertível para JSON Schema (o que a API exige)", () => {
    expect(() => zodOutputFormat(editalExtractionSchema)).not.toThrow();
  });

  /**
   * ⚠️ NENHUM TETO DE TEXTO. Perseguir o número certo é um jogo que não se
   * ganha: no edital do TJ-RJ, primeiro um cargo passou de 200 caracteres,
   * depois um assunto passou de 600. Editais têm "assuntos" que são parágrafos
   * inteiros listando leis — e o teto não faz o modelo escrever mais curto, só
   * derruba a leitura inteira.
   */
  it("aceita textos de qualquer tamanho, como os editais reais trazem", () => {
    const longPosition = "Analista Judiciário – Especialidade: ".padEnd(900, "x");
    const longTopic = "Legislação: ".padEnd(1500, "y");

    const result = editalExtractionSchema.safeParse({
      isReadable: true,
      unreadableReason: null,
      institution: "Tribunal de Justiça do Estado do Rio de Janeiro",
      examBoard: "FGV",
      positions: [longPosition],
      examDate: null,
      examDateIsEstimated: false,
      notes: null,
      subjects: [
        {
          name: "Língua Portuguesa",
          questionCount: 10,
          topics: [{ name: longTopic, questionCount: null }],
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});

describe("clipExtraction", () => {
  const base: EditalExtraction = {
    isReadable: true,
    unreadableReason: null,
    institution: "x".repeat(400),
    examBoard: "y".repeat(300),
    positions: ["p".repeat(600)],
    examDate: null,
    examDateIsEstimated: false,
    notes: "n".repeat(8000),
    subjects: [
      {
        name: "s".repeat(400),
        questionCount: null,
        topics: [
          {
            name: "t".repeat(600),
            questionCount: null,
            children: [{ name: "c".repeat(600), questionCount: null }],
          },
        ],
      },
    ],
  };

  it("apara os textos para as larguras das colunas do banco", () => {
    const clipped = clipExtraction(base);

    expect(clipped.institution).toHaveLength(200);
    expect(clipped.examBoard).toHaveLength(160);
    expect(clipped.positions[0]).toHaveLength(200);
    expect(clipped.notes).toHaveLength(2000);
    expect(clipped.subjects[0].name).toHaveLength(200);
    expect(clipped.subjects[0].topics[0].name).toHaveLength(300);
    expect(clipped.subjects[0].topics[0].children?.[0].name).toHaveLength(300);
  });

  it("não mexe no que já cabe", () => {
    const small: EditalExtraction = {
      ...base,
      institution: "TJ-RJ",
      examBoard: "FGV",
      positions: ["Analista"],
      notes: null,
      subjects: [
        {
          name: "Português",
          questionCount: 10,
          topics: [{ name: "Crase", questionCount: 4, children: [] }],
        },
      ],
    };

    expect(clipExtraction(small)).toEqual(small);
  });

  it("preserva a quantidade de questões — o corte é só de texto", () => {
    // O peso é o que o Motor 1 consome. Se o corte mexesse nele, a priorização
    // mudaria por causa de um nome comprido.
    const clipped = clipExtraction({
      ...base,
      subjects: [
        {
          name: "Português",
          questionCount: 20,
          topics: [{ name: "t".repeat(600), questionCount: 4, children: [] }],
        },
      ],
    });

    expect(clipped.subjects[0].questionCount).toBe(20);
    expect(clipped.subjects[0].topics[0].questionCount).toBe(4);
  });
});
