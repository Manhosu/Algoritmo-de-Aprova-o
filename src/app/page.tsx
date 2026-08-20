import { APP_NAME, APP_TAGLINE } from "@/config/app";

/**
 * PÁGINA TEMPORÁRIA — será substituída pela landing page pública (README 1.3).
 *
 * Existe por dois motivos: não deixar o boilerplate do Next.js no ar e permitir
 * conferir os tokens do design system nos dois temas antes de qualquer tela
 * real ser construída.
 */

const palette = [
  { token: "bg-background", label: "Fundo", value: "#0a0e17" },
  { token: "bg-card", label: "Card", value: "#0f1826" },
  { token: "bg-border", label: "Borda", value: "#1c2b40" },
  { token: "bg-primary", label: "Destaque", value: "#22d3ee" },
  { token: "bg-mastery-high", label: "Alto domínio", value: "🟢" },
  { token: "bg-mastery-medium", label: "Domínio mediano", value: "🟡" },
  { token: "bg-mastery-low", label: "Baixo domínio", value: "🔴" },
];

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:py-20">
      <p className="text-eyebrow">Fundação</p>

      <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {APP_NAME}
      </h1>
      <p className="mt-2 text-balance text-muted-foreground">{APP_TAGLINE}</p>

      <section className="card-surface glow-ring mt-10 p-6">
        <h2 className="text-eyebrow">Paleta ativa</h2>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {palette.map((item) => (
            <li key={item.token} className="flex items-center gap-3">
              <span
                className={`${item.token} size-8 shrink-0 rounded-md border border-border`}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block truncate text-sm text-foreground">
                  {item.label}
                </span>
                <span className="block font-mono text-xs text-muted-foreground">
                  {item.value}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card-surface mt-4 p-6">
        <h2 className="text-eyebrow">Escada de níveis</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {[
            { cls: "bg-level-1", name: "Iniciante" },
            { cls: "bg-level-2", name: "Competitivo" },
            { cls: "bg-level-3", name: "Estrategista" },
            { cls: "bg-level-4", name: "Elite" },
            { cls: "bg-level-5", name: "Implacável" },
          ].map((level) => (
            <li
              key={level.name}
              className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm"
            >
              <span className={`${level.cls} size-2.5 rounded-full`} aria-hidden />
              {level.name}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 text-sm text-muted-foreground">
        Página provisória. A landing page pública entra no Marco 1 (README 1.3).
      </p>
    </main>
  );
}
