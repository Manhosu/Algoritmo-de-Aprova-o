import { z } from "zod";

/**
 * Formato de saída da leitura do edital.
 *
 * Este schema é passado ao modelo via structured outputs (`output_config.format`),
 * então a resposta chega SEMPRE nesta forma — não há parsing frágil de texto
 * livre, e o mesmo schema que instrui o modelo valida o resultado.
 *
 * ⚠️ Cada campo aqui vira uma decisão do motor. `weightSource` decide se o peso
 * é confiável; `examDate` decide se a urgência é neutra ou real. Não acrescente
 * campo sem saber quem o consome.
 */

export const editalTopicSchema = z.object({
  /** Texto do assunto exatamente como aparece no edital. */
  name: z.string().min(1).max(300),

  /**
   * Quantidade de questões que o edital atribui a este assunto, quando o
   * documento informa. A maioria dos editais NÃO informa por assunto.
   */
  questionCount: z.number().int().min(0).max(500).nullable(),

  /** Subassuntos, quando o edital é hierárquico. */
  children: z
    .array(
      z.object({
        name: z.string().min(1).max(300),
        questionCount: z.number().int().min(0).max(500).nullable(),
      }),
    )
    .max(60)
    .optional(),
});

export const editalSubjectSchema = z.object({
  /** Nome da disciplina como aparece no edital. */
  name: z.string().min(1).max(200),

  /** Quantidade de questões da disciplina inteira, quando informada. */
  questionCount: z.number().int().min(0).max(500).nullable(),

  topics: z.array(editalTopicSchema).min(1).max(200),
});

export const editalExtractionSchema = z.object({
  /**
   * `false` quando o PDF não tem camada de texto (documento escaneado) ou
   * quando o conteúdo não é um edital.
   *
   * Existe para o produto poder dizer ao aluno o que aconteceu, em vez de
   * devolver uma extração silenciosamente vazia e deixá-lo achar que a
   * plataforma não funciona.
   */
  isReadable: z.boolean(),

  /** Preenchido quando `isReadable` é falso. Mensagem técnica, não para o aluno. */
  unreadableReason: z
    .enum(["scanned_image", "not_an_edital", "no_program_section", "unknown"])
    .nullable(),

  /** Órgão/instituição do concurso. */
  institution: z.string().max(200).nullable(),

  /** Banca organizadora, se identificada no documento. */
  examBoard: z.string().max(160).nullable(),

  /** Cargos identificados. O aluno escolhe o dele na tela de confirmação. */
  positions: z.array(z.string().max(200)).max(40),

  /**
   * Data da prova em AAAA-MM-DD, quando o edital a informa.
   *
   * Muitos editais só dizem "data provável" ou nem isso. Nesse caso vem nulo,
   * o aluno informa uma data-alvo na confirmação, e a urgência do Motor 1 fica
   * neutra em vez de acelerar em cima de um chute.
   */
  examDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD")
    .nullable(),

  /** Verdadeiro quando o edital marca a data como provável/estimada. */
  examDateIsEstimated: z.boolean(),

  subjects: z.array(editalSubjectSchema).min(1).max(60),

  /**
   * Observações do modelo sobre a extração: partes ilegíveis, ambiguidades,
   * seções que pareciam conteúdo programático mas não eram.
   *
   * Vai para o log, não para o aluno. É o que permite melhorar o prompt
   * olhando casos reais.
   */
  notes: z.string().max(2000).nullable(),
});

export type EditalExtraction = z.infer<typeof editalExtractionSchema>;
export type EditalSubject = z.infer<typeof editalSubjectSchema>;
export type EditalTopic = z.infer<typeof editalTopicSchema>;

/**
 * Versão do prompt, gravada em `edital_extractions.prompt_version`.
 *
 * Quando a extração sair ruim, a única forma de melhorar é comparar entrada e
 * saída reais entre versões. Incremente ao mudar o prompt.
 */
export const EDITAL_PROMPT_VERSION = "v1";
