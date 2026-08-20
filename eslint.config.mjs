import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  /**
   * PUREZA DOS MÓDULOS DE DOMÍNIO
   * ---------------------------------------------------------------------------
   * Convenção do projeto: os motores (priorização e revisão) são lógica pura,
   * testável, sem dependência de framework. Eles vão ser calibrados várias
   * vezes.
   *
   * Convenção escrita em documento se perde na terceira semana. Estas regras
   * transformam a convenção em erro de lint: se alguém importar o banco ou o
   * React dentro de `src/modules`, o build reclama antes de o acoplamento
   * existir. É a diferença entre uma decisão de arquitetura e um desejo.
   */
  {
    files: ["src/modules/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "react", "react-dom", "server-only"],
              message:
                "Módulos de domínio são lógica pura. Sem framework aqui — a orquestração fica em src/server.",
            },
            {
              group: ["drizzle-orm", "drizzle-orm/*", "postgres", "@/server/db", "@/server/db/*"],
              message:
                "Módulos de domínio não acessam o banco. Receba os dados por parâmetro e devolva o resultado.",
            },
            {
              group: ["@/server/*", "@/app/*", "@/components/*", "@/config/env"],
              message:
                "Módulos de domínio não conhecem servidor, telas nem variáveis de ambiente. A dependência é sempre no sentido contrário.",
            },
          ],
        },
      ],
    },
  },

  /**
   * OS DOIS MOTORES NÃO SE CONHECEM
   * ---------------------------------------------------------------------------
   * A separação entre o Motor 1 (Tarefa do Dia) e o Motor 2 (Revisão) é decisão
   * fechada com a cliente (README 1.6 e 1.7). "Estão separados" precisa ser
   * verificável, não uma afirmação de documento.
   *
   * Estas duas regras tornam a separação impossível de violar por descuido:
   * qualquer import entre os dois módulos quebra o build. Se um dia houver
   * motivo real para acoplá-los, será preciso remover esta regra — e aí a
   * decisão vira consciente e explícita, que é o ponto.
   */
  {
    files: ["src/modules/daily-task/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/review", "@/modules/review/*", "../review", "../review/*"],
              message:
                "O Motor 1 não pode conhecer o Motor 2. Revisão é compromisso agendado; tarefa do dia é decisão de hoje. Se precisa de um dado da revisão, receba-o por parâmetro.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/modules/review/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/modules/daily-task",
                "@/modules/daily-task/*",
                "../daily-task",
                "../daily-task/*",
              ],
              message:
                "O Motor 2 não pode conhecer o Motor 1. A revisão vence no dia em que vence, independente de prioridade.",
            },
          ],
        },
      ],
    },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "drizzle/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
