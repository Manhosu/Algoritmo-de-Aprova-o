import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Os motores (priorização e revisão) são lógica pura, sem framework e sem
 * banco — por isso os testes rodam em Node puro, sem jsdom e sem setup de
 * Next.js. Isso mantém a suíte em milissegundos, que é o que permite calibrar
 * os pesos do algoritmo com confiança.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    globals: false,
    coverage: {
      include: ["src/modules/**/*.ts"],
      exclude: ["src/modules/**/index.ts", "src/modules/**/*.test.ts"],
    },
  },
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      /**
       * `server-only` existe para o bundler do Next.js quebrar o build se um
       * Client Component importar código de servidor. Fora do Next ele estoura
       * na importação, o que impediria testar qualquer módulo de servidor —
       * inclusive a política de senha, que é pura.
       *
       * Aqui ele vira um módulo vazio. A proteção real continua valendo onde
       * importa: no `next build`.
       */
      {
        find: /^server-only$/,
        replacement: fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
      },
    ],
  },
});
