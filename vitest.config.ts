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
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
