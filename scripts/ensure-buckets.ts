import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Garante que os buckets do Supabase Storage existem.
 *
 *   npx tsx scripts/ensure-buckets.ts
 *
 * Roda uma vez por ambiente. Existe porque o bucket não nasce com o projeto:
 * o primeiro upload de acervo falhou com "Bucket not found" depois de ler 30
 * arquivos do disco — erro que só aparece no momento de gravar.
 *
 * ⚠️ AMBOS PRIVADOS. `editais` guarda documento do aluno; `acervo` guarda o
 * material que a cliente vende. Nenhum dos dois deve ser servido por URL
 * pública e adivinhável.
 */

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error(
    "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias para criar buckets.",
  );
}

const base = url.replace(/\/+$/, "");
const headers = {
  Authorization: `Bearer ${key}`,
  apikey: key,
  "Content-Type": "application/json",
};

const BUCKETS = [
  { id: "editais", limiteMb: 25 },
  { id: "acervo", limiteMb: 25 },
];

for (const bucket of BUCKETS) {
  const existing = await fetch(`${base}/storage/v1/bucket/${bucket.id}`, { headers });

  if (existing.ok) {
    const info = (await existing.json()) as { public?: boolean };
    console.log(`  = já existe: ${bucket.id} (público: ${info.public ? "SIM ⚠️" : "não"})`);
    continue;
  }

  const created = await fetch(`${base}/storage/v1/bucket`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: bucket.id,
      name: bucket.id,
      public: false,
      file_size_limit: bucket.limiteMb * 1024 * 1024,
    }),
  });

  if (!created.ok) {
    throw new Error(
      `Falha ao criar o bucket ${bucket.id} (${created.status}): ${await created.text()}`,
    );
  }

  console.log(`  ✓ criado: ${bucket.id} (privado, até ${bucket.limiteMb} MB por arquivo)`);
}

console.log("");
