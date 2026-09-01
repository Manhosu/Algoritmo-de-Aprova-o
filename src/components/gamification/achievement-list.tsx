import { Surface } from "@/components/shared/surface";
import { cn } from "@/lib/utils";
import type { AchievementView } from "@/server/engine/achievements";

/**
 * As conquistas do aluno.
 *
 * ⚠️ MOSTRA AS BLOQUEADAS TAMBÉM, com barra de progresso.
 *
 * Uma lista só do que já foi conquistado é uma vitrine: agrada por um segundo e
 * não diz o que fazer em seguida. Com "7 de 30 dias" na tela, a conquista vira
 * meta. As pendentes vêm ordenadas pela mais perto de fechar, então o topo da
 * lista é sempre o próximo passo alcançável.
 */
/**
 * Quantas pendentes ficam à vista antes do "ver todas".
 *
 * ⚠️ São doze conquistas. Um aluno novo tem doze cartões de "0 de N" seguidos, e
 * a lista deixa de ser escada para virar parede: empurra o ranking para fora da
 * tela e não destaca nada. Com as próximas quatro à vista, a seção cabe numa
 * dobra e o resto continua a um clique.
 */
const PENDENTES_A_MOSTRAR = 4;

export function AchievementList({ conquistas }: { conquistas: AchievementView[] }) {
  const desbloqueadas = conquistas.filter((c) => c.unlockedAt);
  const pendentes = conquistas.filter((c) => !c.unlockedAt);

  /*
    `listAchievements` já entrega as pendentes ordenadas pela mais perto de
    fechar, então cortar as primeiras é cortar as mais alcançáveis para dentro.
  */
  const aVista = [...desbloqueadas, ...pendentes.slice(0, PENDENTES_A_MOSTRAR)];
  const escondidas = pendentes.slice(PENDENTES_A_MOSTRAR);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-[0.12em] text-foreground uppercase">
          Conquistas
        </h2>
        <span className="text-metric text-sm text-muted-foreground">
          {desbloqueadas.length} de {conquistas.length}
        </span>
      </div>

      <Lista conquistas={aVista} />

      {escondidas.length > 0 ? (
        <details className="rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm text-primary">
            Ver as outras {escondidas.length}
          </summary>
          <div className="mt-3">
            <Lista conquistas={escondidas} />
          </div>
        </details>
      ) : null}
    </section>
  );
}

function Lista({ conquistas }: { conquistas: AchievementView[] }) {
  return (
      <ul className="flex flex-col gap-2">
        {conquistas.map((conquista) => {
          const concluida = conquista.unlockedAt !== null;
          const percentual = Math.round((conquista.progress / conquista.target) * 100);

          return (
            <li key={conquista.code}>
              <Surface
                className={cn(
                  "flex items-center gap-3 p-3",
                  concluida && "border-success/40 bg-success/5",
                )}
              >
                {/*
                  O emoji fica em escala de cinza enquanto a conquista está
                  bloqueada. É o mesmo ícone, e a diferença de cor diz "ainda
                  não" sem precisar de um cadeado ocupando espaço.
                */}
                <span
                  className={cn("shrink-0 text-xl", !concluida && "opacity-40 grayscale")}
                  aria-hidden
                >
                  {conquista.icon ?? "🏅"}
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-pretty text-sm font-medium",
                      concluida ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {conquista.name}
                  </p>

                  {conquista.description ? (
                    <p className="text-pretty text-xs text-muted-foreground">
                      {conquista.description}
                    </p>
                  ) : null}

                  {!concluida ? (
                    <>
                      <div
                        className="mt-1.5 h-1 overflow-hidden rounded-full bg-background"
                        role="presentation"
                      >
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${percentual}%` }}
                        />
                      </div>
                      <p className="text-metric mt-1 text-xs text-muted-foreground">
                        {conquista.progress} de {conquista.target}
                      </p>
                    </>
                  ) : null}
                </div>

                <span className="shrink-0 text-right text-xs text-muted-foreground">
                  {concluida ? (
                    <span className="text-success">Conquistada</span>
                  ) : (
                    <>
                      <span className="text-metric block text-primary">
                        +{conquista.xpReward} XP
                      </span>
                      {conquista.coinReward > 0 ? (
                        <span className="text-metric block">
                          +{conquista.coinReward} moedas
                        </span>
                      ) : null}
                    </>
                  )}
                </span>
              </Surface>
            </li>
          );
        })}
      </ul>
  );
}
