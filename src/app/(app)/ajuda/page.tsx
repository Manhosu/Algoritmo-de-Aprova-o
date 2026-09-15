import { CircleHelp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Surface } from "@/components/shared/surface";
import { LOGIN_ROUTE } from "@/config/routes";
import { getStudentContext } from "@/server/auth/current-user";

export const metadata: Metadata = {
  title: "Central de Ajuda",
  description: "As dúvidas que a plataforma mais levanta, respondidas.",
};

/**
 * CENTRAL DE AJUDA — item do menu do avatar.
 *
 * ⚠️ RESPONDE AS PERGUNTAS QUE O PRÓPRIO PRODUTO LEVANTA, e só essas.
 *
 * Uma central genérica ("como faço login?") não serve a ninguém. O que confunde
 * aqui é específico: por que o diagnóstico não pode ser refeito, por que o
 * assunto de hoje é aquele, por que a revisão atrasada não some, por que o
 * limite é por dia e não por conteúdo. Cada resposta abaixo corresponde a uma
 * decisão de produto que já teve que ser explicada a alguém.
 *
 * O texto é estático porque é sobre COMO O PRODUTO FUNCIONA — muda quando o
 * comportamento muda, e aí muda junto com o código.
 */
export const dynamic = "force-dynamic";

const PERGUNTAS: Array<{ pergunta: string; resposta: React.ReactNode }> = [
  {
    pergunta: "Por que a Tarefa do Dia trouxe justamente esses assuntos?",
    resposta: (
      <>
        O sistema cruza cinco sinais sobre você e sobre a sua prova: seu
        desempenho no assunto, o peso dele no edital, o tempo até a prova, há
        quanto tempo você não o estuda e onde você mais erra. A conta fica
        registrada e você pode ver a de hoje, assunto por assunto, em{" "}
        <Link
          href="/entenda-o-algoritmo"
          className="text-primary underline-offset-4 hover:underline"
        >
          Entenda o Algoritmo
        </Link>
        .
      </>
    ),
  },
  {
    pergunta: "Errei o nível de um assunto no diagnóstico. Dá para refazer?",
    resposta: (
      <>
        Não precisa. O que você marcou é uma percepção inicial, e ela vai
        perdendo peso conforme você responde questões: com dados suficientes, o
        desempenho real substitui inteiramente o que foi informado. Um clique
        errado se corrige sozinho em poucos dias de prática.
      </>
    ),
  },
  {
    pergunta: "Uma revisão venceu e eu não fiz. Ela sumiu?",
    resposta: (
      <>
        Não. Revisão atrasada acumula e continua aparecendo em Revisões, com os
        dias de atraso. Fazer ela desaparecer transformaria o esquecimento em
        silêncio, que é justamente o que a revisão espaçada existe para
        combater. E o próximo intervalo conta a partir de quando você realmente
        fez, não da data que estava prevista.
      </>
    ),
  },
  {
    pergunta: "Respondi minhas questões do dia. Perdi o conteúdo?",
    resposta: (
      <>
        O limite do plano é por dia, não por conteúdo. Amanhã liberam as
        próximas, e os comentários das questões que você já respondeu continuam
        abertos para reler quando quiser.
      </>
    ),
  },
  {
    pergunta: "O cronograma mudou de um dia para o outro. Está certo?",
    resposta: (
      <>
        Está. Ele é adaptativo: responder questões e concluir estudos move a
        prioridade dos assuntos, e a distribuição se refaz para caber no tempo
        que resta até a prova. Se você quer ver o caminho inteiro e estável, em
        vez do que fazer hoje, use as{" "}
        <Link href="/trilhas" className="text-primary underline-offset-4 hover:underline">
          Trilhas
        </Link>
        .
      </>
    ),
  },
  {
    pergunta: "Meu edital não foi lido. E agora?",
    resposta: (
      <>
        Na maioria das vezes o conteúdo programático está num anexo separado do
        arquivo principal. Junte os dois num PDF só e envie de novo — é o que
        costuma resolver. Se continuar falhando, você pode montar o conteúdo à
        mão pela tela da preparação, sem perder nada.
      </>
    ),
  },
  {
    pergunta: "Como ganho XP e moedas?",
    resposta: (
      <>
        XP vem de estudar, responder questões, acertar, manter a sequência e
        fazer revisões. Moedas vêm de concluir a Tarefa do Dia, concluir estudos,
        fazer revisões e manter dias seguidos de estudo, e são trocadas na{" "}
        <Link href="/loja" className="text-primary underline-offset-4 hover:underline">
          Loja
        </Link>
        . XP nunca é gasto: ele define seu nível e sua posição no ranking.
      </>
    ),
  },
  {
    pergunta: "O ranking mostra o meu nome para outras pessoas?",
    resposta: (
      <>
        Mostra o seu primeiro nome, junto com o nível, a sequência e o XP. O
        sobrenome nunca aparece. Se preferir ficar de fora, desligue &ldquo;Aparecer
        com meu nome no Ranking&rdquo; em{" "}
        <Link
          href="/configuracoes"
          className="text-primary underline-offset-4 hover:underline"
        >
          Configurações
        </Link>
        : você passa a aparecer como &ldquo;Aluno&rdquo;.
      </>
    ),
  },
];

export default async function AjudaPage() {
  const context = await getStudentContext();
  if (!context) redirect(LOGIN_ROUTE);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
          <CircleHelp className="size-5 shrink-0 text-primary" aria-hidden />
          Central de Ajuda
        </h1>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          As dúvidas que a plataforma mais levanta.
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {PERGUNTAS.map((item) => (
          <li key={item.pergunta}>
            <Surface className="overflow-hidden">
              {/*
                `<details>` nativo: funciona sem JavaScript, já vem com a
                semântica de expansível para o leitor de tela, e o navegador
                cuida do resto. Não há nada aqui que justifique estado React.
              */}
              <details>
                <summary className="cursor-pointer list-none p-4 text-pretty font-medium text-foreground transition-colors hover:bg-background/40">
                  {item.pergunta}
                </summary>
                <div className="border-t border-border px-4 py-3 text-pretty text-sm text-muted-foreground">
                  {item.resposta}
                </div>
              </details>
            </Surface>
          </li>
        ))}
      </ul>

      <p className="text-pretty text-sm text-muted-foreground">
        Não achou o que procurava?{" "}
        <Link href="/suporte" className="text-primary underline-offset-4 hover:underline">
          Fale com a equipe
        </Link>
        .
      </p>
    </div>
  );
}
