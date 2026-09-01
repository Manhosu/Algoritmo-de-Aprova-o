import { Surface } from "@/components/shared/surface";
import { SIGNAL_COPY, SIGNAL_ORDER } from "@/modules/daily-task/signal-copy";
import type { ExplainedTopic } from "@/server/engine/explain";

/**
 * A conta de um assunto: quanto cada sinal empurrou.
 *
 * ⚠️ AS BARRAS SÃO PROPORCIONAIS À MAIOR CONTRIBUIÇÃO DESTE ASSUNTO, não a um
 * teto fixo.
 *
 * Medir contra 1,0 deixaria todas as barras curtas e visualmente idênticas —
 * uma contribuição de 0,12 e outra de 0,04 virariam dois tracinhos. Contra a
 * maior do próprio assunto, a leitura passa a ser "o que pesou mais aqui", que
 * é exatamente a pergunta que a tela responde. O número ao lado mantém a escala
 * absoluta visível para quem quiser comparar entre assuntos.
 */
export function TopicExplanation({ topico }: { topico: ExplainedTopic }) {
  const maior = Math.max(
    ...SIGNAL_ORDER.map((sinal) => topico.contributions[sinal]),
    // Evita divisão por zero num assunto cujos cinco sinais deram zero.
    0.0001,
  );

  return (
    <Surface className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline gap-3">
        <span
          className="text-metric shrink-0 text-sm text-primary"
          aria-label={`Posição ${topico.rank} na fila`}
        >
          {topico.rank}º
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-pretty font-semibold text-foreground">
            {topico.topicName}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {topico.subjectName}
          </p>
        </div>

        <span className="text-metric shrink-0 text-sm text-foreground">
          {formatar(topico.score)}
        </span>
      </div>

      {topico.reason ? (
        <p className="text-pretty text-sm text-muted-foreground">{topico.reason}</p>
      ) : null}

      {/*
        ⚠️ RÓTULO ACIMA DA BARRA, não ao lado.

        A primeira versão punha os três lado a lado, com o nome numa coluna
        fixa. Em 390px "Há quanto tempo você não vê" virava "Há quanto tempo
        você não …" — e o sinal que o aluno mais precisa entender era o único
        ilegível. Empilhar dá a largura inteira ao nome e não custa altura
        relevante: a barra tem 6px.
      */}
      <dl className="flex flex-col gap-2.5">
        {SIGNAL_ORDER.map((sinal) => {
          const contribuicao = topico.contributions[sinal];

          return (
            <div key={sinal} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <dt className="min-w-0 flex-1 text-pretty text-xs text-muted-foreground">
                  {SIGNAL_COPY[sinal].label}
                </dt>
                <dd className="text-metric shrink-0 text-xs text-muted-foreground">
                  {formatar(contribuicao)}
                </dd>
              </div>

              <div
                className="h-1.5 overflow-hidden rounded-full bg-background"
                role="presentation"
              >
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(contribuicao / maior) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </dl>
    </Surface>
  );
}

/**
 * Duas casas, com vírgula.
 *
 * `toLocaleString("pt-BR")` faria a mesma coisa e depende do ICU disponível no
 * runtime — que no servidor da Vercel não é o mesmo do navegador. Formatar à
 * mão garante que servidor e cliente produzam a MESMA string, o que é o que
 * evita erro de hidratação.
 */
function formatar(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}
