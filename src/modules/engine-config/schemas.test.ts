import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  coinValuesSchema,
  DEFAULT_COIN_VALUES,
  ENGINE_CONFIG_DEFAULTS,
  ENGINE_CONFIG_SCHEMAS,
} from "./schemas";

describe("configurações de motor", () => {
  /**
   * ⚠️ O ENUM DO BANCO E O MAPA DE SCHEMAS PODEM DIVERGIR SEM AVISO.
   *
   * `EngineConfigKind` é derivado de `ENGINE_CONFIG_SCHEMAS`, não do enum do
   * Postgres. Acrescentar um valor a `engine_config_kind` e esquecer o schema
   * compila: o tipo simplesmente não conhece aquele valor. O efeito aparece
   * tarde — uma linha em `engine_configs` com um `kind` que `parseEngineConfig`
   * não sabe validar, e o motor lendo payload sem conferência.
   */
  it("todo valor do enum engine_config_kind tem schema e padrão", () => {
    const fonte = readFileSync(
      join(process.cwd(), "src/server/db/schema/enums.ts"),
      "utf8",
    );

    const bloco = fonte.match(
      /export const engineConfigKindEnum = pgEnum\(\s*"engine_config_kind",\s*\[([\s\S]*?)\]/,
    );
    expect(bloco, "engineConfigKindEnum mudou de forma; ajuste este teste").toBeTruthy();

    const doBanco = [...bloco![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]).sort();

    expect(Object.keys(ENGINE_CONFIG_SCHEMAS).sort()).toEqual(doBanco);
    expect(Object.keys(ENGINE_CONFIG_DEFAULTS).sort()).toEqual(doBanco);
  });

  it("todo padrão passa no próprio schema", () => {
    /*
      Um padrão que não passa no schema derruba o seed em produção, e só lá —
      é a primeira gravação que executa a validação.
    */
    for (const [kind, schema] of Object.entries(ENGINE_CONFIG_SCHEMAS)) {
      const resultado = schema.safeParse(
        ENGINE_CONFIG_DEFAULTS[kind as keyof typeof ENGINE_CONFIG_DEFAULTS],
      );

      expect(resultado.success, `${kind}: ${resultado.error?.message}`).toBe(true);
    }
  });
});

describe("coin_values", () => {
  it("aceita os padrões", () => {
    expect(coinValuesSchema.safeParse(DEFAULT_COIN_VALUES).success).toBe(true);
  });

  it("RECUSA tudo em zero", () => {
    /*
      Com todas as atividades valendo zero, a Loja fica visível e inalcançável:
      o aluno vê preços que nunca vai poder pagar, e nada na tela explica por
      quê. É pior que não ter Loja.
    */
    const resultado = coinValuesSchema.safeParse({
      dailyTaskCompleted: 0,
      reviewCompleted: 0,
      streakDay: 0,
    });

    expect(resultado.success).toBe(false);
  });

  it("aceita uma atividade só pagando", () => {
    // Zerar duas é decisão de produto legítima; zerar as três é o que quebra.
    expect(
      coinValuesSchema.safeParse({
        dailyTaskCompleted: 25,
        reviewCompleted: 0,
        streakDay: 0,
      }).success,
    ).toBe(true);
  });

  it("recusa valor negativo e fracionário", () => {
    expect(
      coinValuesSchema.safeParse({ ...DEFAULT_COIN_VALUES, streakDay: -1 }).success,
    ).toBe(false);

    expect(
      coinValuesSchema.safeParse({ ...DEFAULT_COIN_VALUES, streakDay: 2.5 }).success,
    ).toBe(false);
  });
});
