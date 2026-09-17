/**
 * A LISTA DE ASSUNTOS QUE O FORMULÁRIO MANDA, LIDA COM DESCONFIANÇA.
 * ============================================================================
 *
 * O formulário manda a lista INTEIRA num campo só, como JSON: um input por campo
 * daria três mil inputs num edital comum.
 *
 * ⚠️ MORA AQUI PORQUE DUAS TELAS GRAVAM A MESMA COISA: a conferência do aluno e
 * a correção pelo painel (pedido da cliente em 17/09/2026). Duas cópias da
 * validação divergiriam no primeiro ajuste, e a diferença apareceria como um
 * peso aceito numa tela e recusado na outra.
 *
 * Cada campo é convertido explicitamente, em vez de confiar na forma do objeto:
 * um `weight` vindo como `"1e9"` ou `NaN` chegaria ao motor e faria um assunto
 * valer mais que o edital inteiro.
 */

export type ContentEdit = {
  /** `id` existente, ou `null` para item novo. */
  id: string | null;
  subjectId: string;
  displayName: string;
  weight: number | null;
  isActive: boolean;
};

/** Teto do peso: 500 questões num assunto só já é um edital inteiro. */
const MAIOR_PESO = 500;

export function parseContentEdits(raw: unknown): ContentEdit[] {
  const parsed: unknown = JSON.parse(String(raw ?? "[]"));
  if (!Array.isArray(parsed)) throw new Error("formato inválido");

  return parsed.flatMap((item): ContentEdit[] => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;

    const subjectId = typeof record.subjectId === "string" ? record.subjectId : null;
    const displayName = typeof record.displayName === "string" ? record.displayName : "";
    if (!subjectId || displayName.trim() === "") return [];

    const weightRaw = record.weight;
    const weightNumber =
      typeof weightRaw === "number"
        ? weightRaw
        : typeof weightRaw === "string" && weightRaw.trim() !== ""
          ? Number(weightRaw)
          : null;

    const weight =
      weightNumber !== null && Number.isFinite(weightNumber) && weightNumber >= 0
        ? Math.min(Math.round(weightNumber), MAIOR_PESO)
        : null;

    return [
      {
        id: typeof record.id === "string" && record.id !== "" ? record.id : null,
        subjectId,
        displayName,
        weight,
        isActive: record.isActive !== false,
      },
    ];
  });
}
