import { z } from "zod";

/**
 * O contrato da copy da página inicial.
 *
 * POR QUE EXISTE UM SCHEMA, E NÃO SÓ UM OBJETO TIPADO
 * ----------------------------------------------------------------------------
 * O texto deixou de morar neste repositório: ele vem de um repositório separado,
 * que a cliente edita sozinha, e é buscado na hora do build. Texto que vem de
 * fora não tem tipo — é uma string de rede até alguém conferir.
 *
 * Este schema é esse alguém, e é usado nos DOIS lados: o script de sincronismo
 * valida o que baixou antes de gravar, e a aplicação valida de novo ao carregar.
 * Um só lugar define o que é uma copy válida.
 *
 * ⚠️ CAMPO NOVO AQUI É CAMPO OBRIGATÓRIO LÁ. Acrescentar uma chave sem
 * acrescentá-la ao arquivo da cliente quebra o build — o que é o comportamento
 * certo (melhor falhar do que publicar um bloco vazio), mas exige mandar o texto
 * novo para ela junto com a mudança.
 */

/**
 * Texto obrigatório: presente, sem ser só espaço em branco.
 *
 * `.min(1)` sozinho aceitaria `" "`, que compila, publica e vira um título em
 * branco na tela — a falha mais cara possível numa landing, porque a página
 * carrega, responde 200 e parece funcionar.
 */
const texto = (max: number) =>
  z
    .string()
    .transform((valor) => valor.trim())
    .pipe(z.string().min(1, "texto vazio").max(max, `passou de ${max} caracteres`));

/**
 * Os limites não são estéticos: são os lugares onde a tela NÃO quebra linha.
 * Ali o texto é cortado com reticências ou empurra o vizinho para fora, então
 * o limite existe para o erro aparecer no build e não depois de publicado.
 */
export const landingSchema = z.object({
  seo: z.object({
    title: texto(70),
    socialTitle: texto(90),
  }),

  hero: z.object({
    eyebrow: texto(60),
    titleLine1: texto(80),
    /** Vai em degradê, numa linha só. */
    titleLine2: texto(40),
    subtitle: texto(400),
    primaryCta: texto(40),
    secondaryCta: texto(40),
    note: texto(80),
  }),

  mockup: z.object({
    title: texto(40),
    /** Etiqueta no canto do painel, largura fixa. */
    badge: texto(20),
    tasks: z
      .array(
        z.object({
          label: texto(16),
          value: texto(60),
          done: z.boolean(),
        }),
      )
      .length(4, "o painel tem espaço para exatamente 4 linhas"),
    footnote: texto(200),
  }),

  howItWorks: z.object({
    eyebrow: texto(60),
    title: texto(90),
    subtitle: texto(220),
    /**
     * As chaves ligam cada texto ao seu ícone e à sua largura na tela. Por
     * posição, reordenar a copy trocaria os ícones de lugar em silêncio.
     */
    steps: z.object({
      upload: passo(),
      review: passo(),
      diagnosis: passo(),
      daily: passo(),
    }),
  }),

  differential: z.object({
    eyebrow: texto(60),
    title: texto(90),
    subtitle: texto(260),
    engines: z.object({
      title: texto(60),
      body: texto(500),
      metrics: z
        .array(
          z.object({
            /** Um terço da largura do bloco: não cabe frase. */
            value: texto(10),
            label: texto(40),
          }),
        )
        .length(3, "são três colunas"),
    }),
    cards: z.object({
      review: passo(),
      schedule: passo(),
    }),
  }),

  closing: z.object({
    title: texto(90),
    cta: texto(40),
    note: texto(120),
  }),

  stickyCta: z.object({
    label: texto(40),
    /** Uma linha só, embaixo do botão fixo do celular. */
    note: texto(40),
  }),
});

function passo() {
  return z.object({ title: texto(70), body: texto(400) });
}

export type LandingCopy = z.infer<typeof landingSchema>;
