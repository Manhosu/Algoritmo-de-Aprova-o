import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * ALINHA A DISCIPLINA DA QUESTÃO À DONA DO ASSUNTO DELA.
 * ============================================================================
 *
 * ⚠️ 560 QUESTÕES ESTAVAM SOB A DISCIPLINA ERRADA, e dava para ver na tela.
 *
 * A importação guardava a disciplina que vinha na PLANILHA e o assunto que o
 * casamento encontrou — e os dois podem discordar por dois caminhos legítimos:
 * um sinônimo casa antes do escopo ser aplicado, e quando a disciplina da
 * planilha não tem assunto nenhum o matcher busca no catálogo inteiro em vez de
 * descartar a questão.
 *
 * O resultado: "Administração" com 560 questões cujos assuntos pertencem a
 * "Administração Pública". Como o filtro do Banco lista os assuntos pela dona
 * real, "Administração" aparecia sem assunto nenhum. A cliente reportou.
 *
 * A regra é simples e passou a valer também na importação: o assunto é o sinal
 * mais específico e é único no sistema inteiro, então ele manda. A disciplina
 * da questão é a dona do assunto dela.
 *
 * ⚠️ NÃO INVENTA NADA. Só corrige linhas onde as duas colunas discordam, e
 * questão sem assunto fica como está — ali não há dona para consultar.
 *
 *   npx tsx scripts/realign-question-subjects.ts          # mostra o que faria
 *   npx tsx scripts/realign-question-subjects.ts --apply
 */

const APLICAR = process.argv.includes("--apply");

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });

const DIVERGENTES = sql`
  q.canonical_topic_id is not null
  and q.deleted_at is null
  and q.canonical_subject_id is distinct from (
    select t.subject_id from canonical_topics t where t.id = q.canonical_topic_id
  )
`;

async function main() {
  const amostra = await sql`
    select sq.name as de, st.name as para, t.name as assunto, count(*)::int as questoes
    from questions q
    join canonical_subjects sq on sq.id = q.canonical_subject_id
    join canonical_topics t on t.id = q.canonical_topic_id
    join canonical_subjects st on st.id = t.subject_id
    where ${DIVERGENTES}
    group by 1, 2, 3
    order by 4 desc
  `;

  const total = amostra.reduce((soma, linha) => soma + Number(linha.questoes), 0);

  console.log(`Questões com disciplina divergente do assunto: ${total}\n`);

  for (const linha of amostra) {
    console.log(
      `  ${String(linha.questoes).padStart(4)}x  ${linha.de} → ${linha.para}` +
        `   (${String(linha.assunto).slice(0, 55)})`,
    );
  }

  if (total === 0) {
    console.log("\nNada a corrigir.\n");
    await sql.end({ timeout: 5 });
    return;
  }

  if (!APLICAR) {
    console.log("\nNada foi alterado. Rode com --apply para corrigir.\n");
    await sql.end({ timeout: 5 });
    return;
  }

  const corrigidas = await sql`
    update questions q
    set canonical_subject_id = (
      select t.subject_id from canonical_topics t where t.id = q.canonical_topic_id
    ),
    updated_at = now()
    where ${DIVERGENTES}
  `;

  console.log(`\n${corrigidas.count} questões realinhadas.`);

  const depois = await sql`
    select s.name as disciplina,
           count(*)::int as questoes,
           count(distinct q.canonical_topic_id)::int as assuntos
    from questions q
    join canonical_subjects s on s.id = q.canonical_subject_id
    where q.deleted_at is null
    group by s.name order by 2 desc
  `;

  console.log("\nAcervo por disciplina, depois:");
  console.table(depois);

  await sql.end({ timeout: 5 });
}

main().catch(async (erro) => {
  console.error(erro);
  await sql.end({ timeout: 5 });
  process.exit(1);
});
