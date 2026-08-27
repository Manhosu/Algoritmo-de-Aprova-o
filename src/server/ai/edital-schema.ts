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

/**
 * ⚠️ ESTE SCHEMA VAI PARA A API. NADA DE `.transform()` AQUI.
 *
 * `zodOutputFormat` converte o schema em JSON Schema para instruir o modelo, e
 * transformação não existe em JSON Schema — a conversão lança
 * "Transforms cannot be represented in JSON Schema" e a leitura morre ANTES de
 * qualquer chamada. Aconteceu comigo ao tentar fazer os campos se auto-cortarem.
 *
 * O corte acontece DEPOIS, em `clipExtraction`. A separação é a correta de
 * qualquer forma: aqui é o contrato com o modelo; lá é a adequação ao banco.
 *
 * ⚠️ E NADA DE `.max()` NOS CAMPOS DE TEXTO LIVRE.
 *
 * Perseguir o teto certo é um jogo que não se ganha. No edital do TJ-RJ:
 * primeiro um nome de cargo passou de 200 caracteres; subi para 300 e um
 * assunto passou de 600. Editais têm "assuntos" que são parágrafos inteiros
 * listando leis.
 *
 * E o teto não compra nada: ele não faz o modelo escrever mais curto, só faz a
 * extração INTEIRA falhar — dois minutos de espera e mais de um dólar de API
 * por causa de um campo secundário. O tamanho total já está limitado por
 * `max_tokens`, e a adequação às colunas do banco é feita por `clipExtraction`.
 *
 * Os limites de QUANTIDADE (arrays) ficam: eles têm efeito real, dizem ao
 * modelo que não é para inventar duzentas disciplinas.
 */

export const editalTopicSchema = z.object({
  /** Texto do assunto exatamente como aparece no edital. */
  name: z.string().min(1),

  /**
   * Quantidade de questões que o edital atribui a este assunto, quando o
   * documento informa. A maioria dos editais NÃO informa por assunto.
   */
  questionCount: z.number().int().min(0).max(500).nullable(),

  /** Subassuntos, quando o edital é hierárquico. */
  children: z
    .array(
      z.object({
        name: z.string().min(1),
        questionCount: z.number().int().min(0).max(500).nullable(),
      }),
    )
    .max(120)
    .optional(),
});

export const editalSubjectSchema = z.object({
  /** Nome da disciplina como aparece no edital. */
  name: z.string().min(1),

  /** Quantidade de questões da disciplina inteira, quando informada. */
  questionCount: z.number().int().min(0).max(500).nullable(),

  topics: z.array(editalTopicSchema).min(1).max(400),
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
  institution: z.string().nullable(),

  /** Banca organizadora, se identificada no documento. */
  examBoard: z.string().nullable(),

  /**
   * Cargos identificados. O aluno escolhe o dele na tela de confirmação.
   *
   * O teto de 300 caracteres por nome é folgado de propósito: editais grandes
   * escrevem coisas como "Analista Judiciário – Grupo: Nível Superior – Sem
   * Especialidade – Área: Administrativa". Foi exatamente um nome desses que
   * derrubou a primeira leitura do edital do TJ-RJ.
   */
  positions: z.array(z.string().min(1)).max(80),

  /**
   * O cargo cujo conteúdo específico foi extraído, copiado do edital.
   *
   * ⚠️ EXISTE PORQUE O ALUNO PRECISA SABER QUANDO ERRAMOS O CARGO.
   *
   * O prompt manda usar "o mais parecido" quando o cargo pedido não aparece no
   * edital, e antes o aviso ia só para `notes`, que nenhuma tela lê. A cliente
   * digitou um cargo inexistente, recebeu o conteúdo de outro sem nenhum
   * alerta e concluiu que o sistema tinha misturado editais. Estava fazendo o
   * que foi mandado — em silêncio, que é o problema.
   *
   * Nulo quando o aluno não informou cargo (extração de todos).
   */
  matchedPosition: z.string().nullable(),

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

  subjects: z.array(editalSubjectSchema).min(1).max(80),

  /**
   * Observações do modelo sobre a extração: partes ilegíveis, ambiguidades,
   * seções que pareciam conteúdo programático mas não eram.
   *
   * Vai para o log, não para o aluno. É o que permite melhorar o prompt
   * olhando casos reais.
   */
  notes: z.string().nullable(),
});

export type EditalExtraction = z.infer<typeof editalExtractionSchema>;

/* ========================================================================== *
 * ADEQUAÇÃO AO BANCO
 * ========================================================================== */

/**
 * Corta os textos para as larguras das colunas, DEPOIS da validação.
 *
 * O schema acima aceita bem mais do que o banco guarda, de propósito: recusar
 * uma extração inteira por causa de um nome comprido é caro e não ajuda
 * ninguém. Aqui o texto é aparado — o que aconteceria de qualquer forma na
 * gravação, só que sem derrubar nada.
 */
export function clipExtraction(data: EditalExtraction): EditalExtraction {
  const clip = (value: string, max: number) => value.slice(0, max);

  return {
    ...data,
    institution: data.institution ? clip(data.institution, 200) : null,
    examBoard: data.examBoard ? clip(data.examBoard, 160) : null,
    positions: data.positions.map((position) => clip(position, 200)),
    matchedPosition: data.matchedPosition ? clip(data.matchedPosition, 200) : null,
    notes: data.notes ? clip(data.notes, 2000) : null,
    subjects: data.subjects.map((subject) => ({
      ...subject,
      name: clip(subject.name, 200),
      topics: subject.topics.map((topic) => ({
        ...topic,
        name: clip(topic.name, 300),
        children: topic.children?.map((child) => ({
          ...child,
          name: clip(child.name, 300),
        })),
      })),
    })),
  };
}
export type EditalSubject = z.infer<typeof editalSubjectSchema>;
export type EditalTopic = z.infer<typeof editalTopicSchema>;

/**
 * Versão do prompt, gravada em `edital_extractions.prompt_version`.
 *
 * Quando a extração sair ruim, a única forma de melhorar é comparar entrada e
 * saída reais entre versões. Incremente ao mudar o prompt.
 *
 * v2 (24/08/2026) — o conteúdo passou a ser extraído SÓ do cargo que o aluno
 * informou, em vez de todos os cargos do edital. Num edital real de 83 páginas
 * com oito especialidades, a versão anterior estourava o orçamento de saída e
 * a leitura falhava inteira.
 */
/**
 * ⚠️ SOBE JUNTO COM QUALQUER MUDANÇA NO PROMPT OU NO SCHEMA.
 *
 * O cache de leitura só reaproveita extração da MESMA versão. Sem subir aqui,
 * um aluno receberia hoje a resposta de um prompt antigo, sem os campos novos
 * — e o defeito apareceria como campo vazio sem explicação.
 *
 * v3: `matchedPosition`, para o aluno saber de qual cargo veio o conteúdo.
 */
export const EDITAL_PROMPT_VERSION = "v3";
