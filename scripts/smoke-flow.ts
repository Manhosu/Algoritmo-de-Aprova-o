import { createHash, randomBytes, randomUUID, createHmac } from "node:crypto";

import { hash } from "@node-rs/argon2";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Percorre o caminho crítico do aluno com uma sessão REAL e confere o que cada
 * tela devolve.
 *
 * POR QUE ISSO EXISTE
 * ----------------------------------------------------------------------------
 * `tsc`, `eslint` e os testes de unidade não provam que a página renderiza.
 * Este script cria um usuário de verdade, abre uma sessão de verdade e pede as
 * páginas por HTTP — o mesmo caminho que o navegador percorre, incluindo o
 * proxy, os guards e as consultas ao banco.
 *
 * Ele LIMPA tudo que criou ao final, inclusive quando falha no meio.
 *
 * Uso: npm run smoke   (com `npm run dev` rodando)
 */

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const MARKER = "smoke-test";

type Step = { label: string; ok: boolean; detail: string };
const steps: Step[] = [];

function record(label: string, ok: boolean, detail = "") {
  steps.push({ label, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");

  const sql = postgres(url, { max: 1, prepare: false });

  const userId = randomUUID();
  const email = `${MARKER}-${Date.now()}@exemplo.invalido`;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const pseudonym = createHmac("sha256", process.env.ANONYMIZATION_PEPPER ?? "x")
    .update(userId)
    .digest("hex");

  const cookieName = "aa_session";
  const cookie = `${cookieName}=${token}`;

  try {
    console.log(`Alvo: ${BASE}\n`);
    console.log("Preparando usuário de teste...");

    const passwordHash = await hash("uma frase longa de teste", {
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });

    await sql`
      insert into users (id, name, email, whatsapp, password_hash, pseudonym_key, role, status, timezone)
      values (${userId}, 'Aluno de Teste', ${email}, '+5511999990000', ${passwordHash},
              ${pseudonym}, 'student', 'active', 'America/Sao_Paulo')
    `;

    const [freePlan] = await sql<Array<{ id: string }>>`
      select id from plans where code = 'free' limit 1
    `;
    await sql`
      insert into subscriptions (user_id, plan_id, status, provider)
      values (${userId}, ${freePlan.id}, 'active', 'manual')
    `;
    await sql`
      insert into user_funnel_progress (pseudonym_key, user_id, signed_up_at, last_stage_reached, last_stage_reached_at)
      values (${pseudonym}, ${userId}, now(), 'signed_up', now())
    `;
    await sql`
      insert into auth_sessions (user_id, token_hash, expires_at)
      values (${userId}, ${tokenHash}, now() + interval '1 day')
    `;

    console.log("Percorrendo o fluxo:\n");

    /* --- 1. sem disponibilidade, a Home manda para o onboarding ------------ */
    let res = await fetch(`${BASE}/inicio`, { headers: { cookie }, redirect: "manual" });
    record(
      "Home redireciona para o onboarding quando falta disponibilidade",
      res.status === 307 && (res.headers.get("location") ?? "").includes("/boas-vindas"),
      `${res.status} → ${res.headers.get("location") ?? "—"}`,
    );

    /* --- 2. a tela de onboarding abre -------------------------------------- */
    res = await fetch(`${BASE}/boas-vindas`, { headers: { cookie } });
    let html = await res.text();
    record(
      "Tela de disponibilidade renderiza",
      res.ok && html.includes("Boas-vindas") && html.includes("Segunda"),
      `${res.status}`,
    );

    /* --- 3. informada a disponibilidade, a Home abre ----------------------- */
    await sql`
      insert into user_availability (user_id, weekday, minutes_available) values
        (${userId}, 1, 60), (${userId}, 2, 60), (${userId}, 3, 60),
        (${userId}, 4, 60), (${userId}, 5, 60), (${userId}, 6, 240)
    `;

    res = await fetch(`${BASE}/inicio`, { headers: { cookie } });
    html = await res.text();
    record(
      "Home abre e convida a criar a preparação",
      res.ok && html.includes("Comece pelo edital"),
      `${res.status}`,
    );

    /* --- 4. formulário de nova preparação ---------------------------------- */
    res = await fetch(`${BASE}/preparacoes/nova`, { headers: { cookie } });
    html = await res.text();
    record(
      "Formulário de nova preparação renderiza com as bancas",
      res.ok && html.includes("Cargo pretendido") && html.includes("Cebraspe"),
      `${res.status}`,
    );

    /* --- 5. gate de plano: a segunda preparação é barrada ------------------ */
    const [prep] = await sql<Array<{ id: string }>>`
      insert into preparations (user_id, target_position, title, status, is_current)
      values (${userId}, 'Analista Judiciário', 'Analista Judiciário', 'draft', true)
      returning id
    `;
    const preparationId = prep.id;

    res = await fetch(`${BASE}/preparacoes/nova`, { headers: { cookie } });
    html = await res.text();
    record(
      "Gate do plano Free barra a segunda preparação",
      res.ok && html.includes("Você já tem"),
      `${res.status}`,
    );

    /* --- 6. a Home passa a pedir o edital ---------------------------------- */
    res = await fetch(`${BASE}/inicio`, { headers: { cookie } });
    html = await res.text();
    record(
      "Home mostra o próximo passo: enviar o edital",
      res.ok && html.includes("Falta enviar o edital"),
      `${res.status}`,
    );

    /* --- 7. estados seguintes da preparação -------------------------------- */
    const estados: Array<[string, string]> = [
      ["review_pending", "Confira o que a IA leu"],
      ["diagnosis_pending", "Falta o diagnóstico"],
      ["failed", "Não conseguimos ler seu edital"],
    ];

    for (const [status, esperado] of estados) {
      await sql`update preparations set status = ${status} where user_id = ${userId}`;
      res = await fetch(`${BASE}/inicio`, { headers: { cookie } });
      html = await res.text();
      record(`Home reflete o estado "${status}"`, res.ok && html.includes(esperado));
    }

    /* --- 7b. as telas do fluxo do "+" ------------------------------------- */
    await sql`update preparations set status = 'draft' where id = ${preparationId}`;

    res = await fetch(`${BASE}/preparacoes/${preparationId}/edital`, { headers: { cookie } });
    html = await res.text();
    record(
      "Tela de envio do edital renderiza",
      res.ok && html.includes("Envie o edital") && html.includes("Toque para escolher o PDF"),
      `${res.status}`,
    );

    // Conteúdo mínimo para as telas 3 e 4 terem o que mostrar.
    const [subject] = await sql<Array<{ id: string }>>`
      insert into study_plan_subjects
        (preparation_id, raw_name, display_name, normalized_name, sort_order, origin, mapping_status)
      values (${preparationId}, 'Língua Portuguesa', 'Língua Portuguesa', 'lingua portuguesa', 0, 'ai', 'unmapped')
      returning id
    `;
    await sql`
      insert into study_plan_topics
        (preparation_id, plan_subject_id, raw_name, display_name, normalized_name,
         depth, sort_order, weight_source, mapping_status, origin)
      values (${preparationId}, ${subject.id}, 'Crase', 'Crase', 'crase',
              0, 0, 'default', 'unmapped', 'ai')
    `;

    await sql`update preparations set status = 'review_pending' where id = ${preparationId}`;
    res = await fetch(`${BASE}/preparacoes/${preparationId}/conteudo`, { headers: { cookie } });
    html = await res.text();
    record(
      "Tela de revisão do conteúdo renderiza o que a IA leu",
      res.ok && html.includes("Confira o que a IA leu") && html.includes("Língua Portuguesa"),
      `${res.status}`,
    );

    await sql`update preparations set status = 'diagnosis_pending' where id = ${preparationId}`;
    res = await fetch(`${BASE}/preparacoes/${preparationId}/diagnostico`, {
      headers: { cookie },
    });
    html = await res.text();

    /**
     * ⚠️ O README 1.5 exige este aviso com ESTE texto, palavra por palavra. É
     * requisito de aceite do Marco 1, e o tipo de coisa que se perde num
     * ajuste de copy meses depois — por isso a verificação compara o texto
     * inteiro, e não um trecho.
     */
    const NOTICE =
      "O nível de domínio informado neste diagnóstico é uma percepção inicial sobre o " +
      "seu conhecimento. Ele será continuamente validado e atualizado pelo Algoritmo da " +
      "Aprovação conforme você resolver questões, realizar revisões e evoluir na preparação.";

    record(
      "Tela de diagnóstico exibe o aviso obrigatório com o texto exato do README",
      res.ok && stripHtml(html).includes(NOTICE),
      `${res.status}`,
    );

    /* --- 7c. as telas do aluno ativo -------------------------------------- */
    res = await fetch(`${BASE}/questoes`, { headers: { cookie } });
    html = await res.text();
    record(
      "Banco de questões renderiza com o painel de filtros",
      // "Dificuldade" só aparece com o painel aberto, e ele começa fechado —
      // 300 questões com quatro selects abertos empurrariam a primeira questão
      // para fora da tela no celular.
      res.ok && html.includes("Filtros") && html.includes("questões disponíveis"),
      `${res.status}`,
    );

    /**
     * ⚠️ O gabarito não pode chegar ao navegador antes de o aluno responder.
     * Esta verificação olha o HTML DE VERDADE que sai pela rede, e não o objeto
     * do serviço: é o único jeito de pegar um vazamento que aconteça na
     * serialização do React em vez de na consulta.
     */
    record(
      "O HTML da lista de questões NÃO carrega o gabarito",
      res.ok && !/\?"isCorrect\?":/.test(html) && !html.includes('"isCorrect"'),
      "nenhum isCorrect no payload",
    );

    res = await fetch(`${BASE}/revisoes`, { headers: { cookie } });
    html = await res.text();
    record(
      "Tela de revisões renderiza",
      res.ok && html.includes("Revisões") && html.includes("24 horas"),
      `${res.status}`,
    );

    res = await fetch(`${BASE}/cronograma`, { headers: { cookie } });
    record("Tela de cronograma renderiza", res.ok, `${res.status}`);

    res = await fetch(`${BASE}/preparacoes`, { headers: { cookie } });
    html = await res.text();
    record(
      "Tela de gestão da preparação renderiza com o gate do plano visível",
      res.ok && html.includes("Minhas preparações") && html.includes("preparação ativa"),
      `${res.status}`,
    );

    res = await fetch(`${BASE}/configuracoes`, { headers: { cookie } });
    html = await res.text();
    record(
      "Configurações renderiza senha, e-mail e exclusão",
      res.ok &&
        html.includes("Trocar senha") &&
        html.includes("Trocar e-mail") &&
        html.includes("Excluir conta"),
      `${res.status}`,
    );

    res = await fetch(`${BASE}/recuperar-senha`);
    html = await res.text();
    record(
      "Recuperação de senha é pública e não revela se o e-mail existe",
      res.ok && html.includes("Esqueceu a senha?") && html.includes("Se houver uma"),
      `${res.status}`,
    );

    /* --- 7d. camada pública: jurídicas, 404 e SEO ------------------------- */
    /**
     * ⚠️ `/termos-de-uso` era um link QUEBRADO em produção: o checkbox do
     * cadastro apontava para cá e dava 404, enquanto o texto prometia que a
     * pessoa tinha lido os Termos.
     */
    res = await fetch(`${BASE}/termos-de-uso`);
    html = await res.text();
    record(
      "Termos de Uso respondem e trazem o texto do banco",
      res.ok && html.includes("Termos de Uso") && html.includes("Índice de Preparação"),
      `${res.status}`,
    );

    res = await fetch(`${BASE}/planos`);
    html = await res.text();
    record(
      "Página de planos monta os limites a partir do banco",
      res.ok && html.includes("questões por dia") && html.includes("ilimitadas"),
      `${res.status}`,
    );

    /**
     * A 404 do Next é em inglês, sem marca e sem saída. Esta verificação
     * garante que quem erra o endereço encontra o produto, não um beco.
     */
    res = await fetch(`${BASE}/rota-que-nao-existe-${Date.now()}`);
    html = await res.text();
    record(
      "Rota inexistente cai na 404 do produto, não na do Next",
      res.status === 404 && html.includes("Essa página não existe"),
      `${res.status}`,
    );

    /**
     * ⚠️ O 404 novo não pode ter custado a proteção. Rota privada SEM sessão
     * continua indo para o login, e é isso que esta verificação trava.
     */
    res = await fetch(`${BASE}/inicio`, { redirect: "manual" });
    record(
      "Rota privada sem sessão continua indo para o login",
      res.status === 307 && (res.headers.get("location") ?? "").includes("/entrar"),
      `${res.status}`,
    );

    res = await fetch(`${BASE}/robots.txt`);
    const robots = await res.text();
    record(
      "robots.txt mantém a área do aluno fora dos buscadores",
      res.ok && robots.includes("Disallow: /inicio") && robots.includes("Sitemap:"),
      `${res.status}`,
    );

    res = await fetch(`${BASE}/sitemap.xml`);
    const sitemap = await res.text();
    record(
      "sitemap.xml lista as públicas e NENHUMA privada",
      res.ok && sitemap.includes("/termos-de-uso") && !sitemap.includes("/inicio"),
      `${res.status}`,
    );

    /**
     * O canal principal da cliente é o WhatsApp, que só monta o card com URL
     * ABSOLUTA. Relativa aqui significa link cinza sem imagem.
     */
    res = await fetch(`${BASE}/`);
    html = await res.text();
    const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/)?.[1] ?? "";
    record(
      "A landing traz og:image com URL absoluta",
      ogImage.startsWith("http"),
      ogImage.slice(0, 60) || "ausente",
    );

    /* --- 8. logout revoga a sessão no banco -------------------------------- */
    res = await fetch(`${BASE}/sair`, { headers: { cookie }, redirect: "manual" });
    const [session] = await sql<Array<{ revoked_at: Date | null }>>`
      select revoked_at from auth_sessions where token_hash = ${tokenHash}
    `;
    record(
      "Logout revoga a sessão no banco, não só apaga o cookie",
      session?.revoked_at !== null,
      session?.revoked_at ? "revogada" : "AINDA ATIVA",
    );

    /* --- 9. sessão revogada não abre mais nada ----------------------------- */
    res = await fetch(`${BASE}/inicio`, { headers: { cookie }, redirect: "manual" });
    record(
      "Sessão revogada não dá mais acesso",
      res.status === 307 && (res.headers.get("location") ?? "").includes("/entrar"),
      `${res.status}`,
    );
  } finally {
    /**
     * Limpa mesmo se algo falhou no meio: usuário de teste esquecido no banco
     * da cliente contamina as métricas do funil.
     *
     * ⚠️ `subscriptions` e `payments` referenciam `users` com ON DELETE
     * RESTRICT — de propósito, porque registro financeiro tem prazo de guarda
     * legal e não pode sumir num cascade acidental. Isso significa que este
     * script precisa apagar na ordem, e não pode simplesmente remover o
     * usuário. A primeira execução falhou exatamente aqui, o que é uma boa
     * notícia: a proteção funciona.
     */
    await sql`
      delete from subscriptions
      where user_id in (select id from users where email like ${`${MARKER}-%`})
    `;
    await sql`delete from users where email like ${`${MARKER}-%`}`;
    await sql.end({ timeout: 5 });
  }

  const failed = steps.filter((step) => !step.ok);
  console.log("");
  if (failed.length > 0) {
    console.error(`${failed.length} de ${steps.length} verificações falharam.`);
    process.exit(1);
  }
  console.log(`${steps.length} verificações passaram. Dados de teste removidos.`);
}

/**
 * Tira as tags e devolve o texto corrido.
 *
 * O React quebra o parágrafo em vários nós de texto com comentários entre eles
 * (`<!-- -->`), então procurar a frase inteira no HTML cru falharia mesmo com o
 * texto correto na tela.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

main().catch((error) => {
  console.error("\n", error instanceof Error ? error.message : error);
  process.exit(1);
});
