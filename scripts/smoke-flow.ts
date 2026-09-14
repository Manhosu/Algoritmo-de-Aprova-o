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

const NOME_DE_TESTE = "Aluno de Teste";

/**
 * O nome do colega-isca, usado como sonda de vazamento de PII no Ranking.
 *
 * Se ele aparecer no HTML de `/ranking`, é porque a tela publicou o nome de um
 * aluno para OUTRO — que é justamente o que a Política de Privacidade aceita no
 * cadastro não prevê.
 *
 * ⚠️ Não dá para usar o nome do próprio usuário logado como sonda: ele aparece
 * legitimamente no cabeçalho de toda página. Foi o falso positivo da primeira
 * versão desta verificação.
 */
const NOME_ISCA = "Zebedeu Quaresma Xavier";

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

  /**
   * ⚠️ MANDA OS DOIS NOMES DE COOKIE, DE PROPÓSITO.
   *
   * `SESSION_COOKIE_NAME` ganha o prefixo `__Host-` quando `NODE_ENV` é
   * production (`config/routes.ts`). Quem decide isso é o processo do
   * SERVIDOR, não este script: apontar o smoke para um build de produção
   * (`next start`) fazia o script mandar `aa_session` enquanto o servidor
   * procurava `__Host-aa_session`. Resultado: 17 de 29 verificações falhando
   * com 307 para o login, como se o produto estivesse quebrado.
   *
   * O prefixo `__Host-` é regra de NAVEGADOR na hora de gravar o cookie; o
   * servidor apenas lê pelo nome. Mandar os dois é seguro — cada alvo lê o
   * que reconhece e ignora o outro — e deixa o smoke rodar contra `dev` e
   * contra `start` sem depender de acertar o `NODE_ENV` do terminal.
   */
  const cookie = `aa_session=${token}; __Host-aa_session=${token}`;

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
      values (${userId}, ${NOME_DE_TESTE}, ${email}, '+5511999990000', ${passwordHash},
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

    /*
      O COLEGA-ISCA do Ranking.

      Um segundo aluno, com XP alto para garantir que ele apareça no topo da
      lista, e com um nome que não existe em nenhum outro lugar do produto. Se
      esse nome aparecer no HTML de `/ranking`, é porque a tela publicou o nome
      de um aluno para outro.

      A sonda precisa ser um SEGUNDO aluno: usar o nome do próprio usuário
      logado não serviria, porque ele aparece legitimamente no cabeçalho — foi
      exatamente esse o falso positivo da primeira versão desta verificação.
    */
    const colegaId = randomUUID();
    const colegaPseudonimo = createHmac("sha256", process.env.ANONYMIZATION_PEPPER ?? "x")
      .update(colegaId)
      .digest("hex");

    await sql`
      insert into users (id, name, email, whatsapp, password_hash, pseudonym_key, role, status, timezone)
      values (${colegaId}, ${NOME_ISCA}, ${`${MARKER}-colega-${Date.now()}@exemplo.invalido`},
              '+5511999990002', ${passwordHash}, ${colegaPseudonimo}, 'student', 'active',
              'America/Sao_Paulo')
    `;
    await sql`
      insert into user_gamification_states (user_id, total_xp, current_streak, longest_streak)
      values (${colegaId}, 999999, 42, 42)
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
      res.ok && html.includes("Comece pela sua preparação"),
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

    /* Jogos (14/09/2026): o botão do menu leva a uma página, e não a um 404. */
    res = await fetch(`${BASE}/jogos`, { headers: { cookie } });
    html = await res.text();
    record(
      "Jogos renderiza para o aluno logado",
      res.ok && html.includes("Aprenda jogando") && html.includes('href="/jogos"'),
      `${res.status}`,
    );

    /*
     * ⚠️ ANTES DE ATIVAR: as telas que dependem do plano precisam MANDAR o
     * aluno para o passo que falta, e não só dizer que estão vazias.
     *
     * A cliente clicou em Cronograma antes de subir o edital e recebeu um botão
     * de volta para a Home — dois cliques para descobrir que faltava um PDF.
     * Ela chamou de link quebrado. Aqui a preparação está em `diagnosis_pending`,
     * então as duas telas devem apontar para o diagnóstico.
     */
    for (const rota of ["/cronograma", "/revisoes"]) {
      res = await fetch(`${BASE}${rota}`, { headers: { cookie } });
      html = await res.text();
      record(
        `${rota} manda para o passo que falta, e não para a Home`,
        res.ok &&
          html.includes("Falta o diagnóstico") &&
          html.includes(`/preparacoes/${preparationId}/diagnostico`),
        `${res.status}`,
      );
    }

    await sql`update preparations set status = 'active' where id = ${preparationId}`;

    res = await fetch(`${BASE}/revisoes`, { headers: { cookie } });
    html = await res.text();
    record(
      "Tela de revisões renderiza",
      res.ok && html.includes("Revisões") && html.includes("24 horas"),
      `${res.status}`,
    );

    res = await fetch(`${BASE}/cronograma`, { headers: { cookie } });
    record("Tela de cronograma renderiza", res.ok, `${res.status}`);

    /* ====================================================================== *
     * O CHECKLIST DE ACEITE DO MARCO 2, conferido no HTML de produção.
     *
     * ⚠️ ESTES ITENS SÓ EXISTIAM NA MINHA MEMÓRIA até 07/09/2026.
     *
     * O verify-engine cobre as REGRAS e o smoke cobria as telas responderem.
     * Faltava a ponte: os itens do aceite que são sobre o que aparece na tela.
     * Dizer "está pronto" sobre algo que ninguém conferiu desde que foi escrito
     * é como o produto passa a divergir do que foi combinado, um item por vez.
     * ====================================================================== */

    res = await fetch(`${BASE}/inicio`, { headers: { cookie } });
    html = await res.text();

    /*
      A contagem regressiva só aparece com data de prova, e este aluno não tem.
      Dar a data aqui é o que torna o item verificável de verdade — sem ela, a
      verificação passaria a medir a ausência do recurso.
    */
    await sql`
      update preparations set exam_date = current_date + 30 where id = ${preparationId}
    `;

    res = await fetch(`${BASE}/inicio`, { headers: { cookie } });
    html = await res.text();

    record(
      "Aceite 1 · Home traz o nome do aluno e a contagem para a prova",
      html.includes(NOME_DE_TESTE.split(" ")[0]) && /dias? para a prova/.test(html),
      "nome + contagem",
    );

    record(
      "Aceite 2 · As quatro métricas estão na Home",
      ["HORÁRIO DE OURO", "COBERTURA DO EDITAL", "LACUNAS", "HORAS ESTUDADAS"].every(
        (rotulo) => html.toUpperCase().includes(rotulo),
      ),
      "horário de ouro, cobertura, lacunas, horas",
    );

    record(
      "Aceite 3 · O card diz Índice de Preparação, nunca de Aprovação",
      html.toUpperCase().includes("ÍNDICE DE PREPARAÇÃO") &&
        !html.toUpperCase().includes("ÍNDICE DE APROVAÇÃO"),
      "rótulo correto",
    );

    record(
      "Aceite 5 · A barra inferior é fixa",
      /class="[^"]*fixed[^"]*inset-x-0[^"]*bottom-0/.test(html),
      "fixed inset-x-0 bottom-0",
    );

    /*
      ⚠️ O CONTEÚDO DO MENU DO AVATAR NÃO ESTÁ NO HTML DO SERVIDOR.

      O menu é do Radix e só monta ao abrir, então procurar "Meu Perfil" na
      resposta seria procurar algo que nunca vai estar lá — e a verificação
      falharia para sempre com o produto certo.
      
      O que dá para provar por HTTP é o que importa: os quatro destinos do menu
      existem e abrem. Um item de menu que leva a 404 é o defeito real; o menu
      fechado não é.
    */
    for (const [rota, item] of [
      ["/perfil", "Meu Perfil"],
      ["/configuracoes", "Configurações"],
      ["/suporte", "Feedback & Suporte"],
      ["/ajuda", "Central de Ajuda"],
    ] as const) {
      res = await fetch(`${BASE}${rota}`, { headers: { cookie } });
      record(`Aceite 6 · "${item}" do menu abre`, res.ok, `${rota} — ${res.status}`);
    }

    /*
      O seletor de tema também vive dentro do menu. O que chega ao HTML é o
      atributo que o `next-themes` escreve na raiz, e é ele que prova que os
      dois temas estão montados.
    */
    res = await fetch(`${BASE}/inicio`, { headers: { cookie } });
    html = await res.text();
    record(
      "Aceite 7 · O tema está montado na página",
      /class="[^"]*(dark|light)/.test(html) || html.includes("color-scheme"),
      "next-themes na raiz",
    );

    /*
      `Nível {numero}` sai do React com o número em nó de texto separado, então
      um regex de "NÍVEL 1" no HTML cru não casa nunca. As duas palavras juntas
      são o que prova o card.
    */
    record(
      "Aceite 8 · O nível do aluno aparece com nome e faixa de XP",
      /Nível/.test(html) && /XP/.test(html) && /Iniciante|Constante|Competitivo|Estrategista/.test(html),
      "nível, nome da faixa e XP",
    );

    /*
      Item 4: o gráfico não plota ponto em dia sem questões. Este aluno não
      respondeu nada, então a série precisa estar VAZIA — e a tela precisa
      dizer isso em vez de desenhar uma linha reta no zero, que seria uma
      afirmação falsa sobre o desempenho dele.
    */
    record(
      "Aceite 4 · Sem questões respondidas, a evolução não inventa pontos",
      html.includes("Com alguns dias de prática"),
      "estado vazio da evolução",
    );

    res = await fetch(`${BASE}/estudos`, { headers: { cookie } });
    html = await res.text();
    record(
      "Aceite 12 · A biblioteca mostra o acervo inteiro, não só o edital",
      res.ok && !html.includes("Nenhum material"),
      `${res.status}`,
    );


    /*
      "Entenda o Algoritmo" abre mesmo SEM tarefa gerada.

      Este aluno de teste acabou de ficar ativo e ainda não tem Tarefa do Dia
      nenhuma, que é justamente o caso que quebraria a tela se ela assumisse que
      sempre há uma para explicar. O estado vazio precisa ser o estado vazio, e
      não um erro de servidor.
    */
    res = await fetch(`${BASE}/entenda-o-algoritmo`, { headers: { cookie } });
    html = await res.text();
    record(
      "Entenda o Algoritmo abre e lista os cinco sinais",
      res.ok &&
        /* "Seu desempenho" saiu em 08/09/2026 — ver a nota em `hardReviewsSignal`. */
        html.includes("Revisões difíceis") &&
        html.includes("Peso no edital") &&
        html.includes("Tempo até a prova") &&
        html.includes("Suas lacunas"),
      `${res.status}`,
    );

    res = await fetch(`${BASE}/trilhas`, { headers: { cookie } });
    html = await res.text();
    record(
      "Trilhas monta o percurso a partir do edital",
      res.ok && html.includes("Trilhas") && html.includes("dominados"),
      `${res.status}`,
    );

    /*
      O Ranking NÃO pode trazer o nome de aluno nenhum.

      A Política de Privacidade aceita no cadastro não prevê exibir o nome de um
      aluno para outro. Esta verificação existe porque a regressão é fácil e
      silenciosa: basta alguém acrescentar `users.name` ao select para publicar
      dado pessoal sem que nada quebre.
    */
    res = await fetch(`${BASE}/ranking`, { headers: { cookie } });
    html = await res.text();
    record(
      "Ranking abre sem expor o nome de outro aluno",
      res.ok &&
        html.includes("Ranking") &&
        // O colega-isca ESTÁ na lista (999.999 XP o coloca em 1º)...
        html.includes("999999") &&
        // ...e mesmo assim o nome dele não aparece em lugar nenhum.
        !html.includes(NOME_ISCA),
      `${res.status}`,
    );

    record(
      "A lista de conquistas aparece com o progresso das bloqueadas",
      html.includes("Conquistas") && html.includes("Primeiro passo"),
      "catálogo carregado",
    );

    res = await fetch(`${BASE}/loja`, { headers: { cookie } });
    html = await res.text();
    record(
      "Loja abre e mostra o saldo de moedas",
      res.ok && html.includes("Loja") && html.includes("Seu saldo"),
      `${res.status}`,
    );

    /*
      Os destinos do menu do avatar.

      ⚠️ Três deles ficaram DESABILITADOS no menu por semanas, esperando a tela.
      Ligar o link e esquecer a página é a forma mais fácil de reintroduzir um
      404 no menu principal, e o aluno conclui que a plataforma quebrou.

      ⚠️ `/planos` ENTROU EM 08/09/2026, e por um motivo que este teste não
      pega sozinho: eu troquei o "+" da barra inferior pelo Mind-X e levei junto
      o único caminho até a tela de planos. A cliente reportou como "o botão
      para mudar de plano ficou meio sumido". A rota respondia 200 o tempo todo;
      o que sumiu foi o link para ela.
    */
    for (const [rota, marcador] of [
      ["/perfil", "Meu Perfil"],
      ["/planos", "Planos"],
      ["/configuracoes", "Configurações"],
      ["/suporte", "Feedback"],
      ["/ajuda", "Central de Ajuda"],
    ] as const) {
      res = await fetch(`${BASE}${rota}`, { headers: { cookie } });
      html = await res.text();
      record(
        `${rota} abre para o aluno`,
        res.ok && html.includes(marcador),
        `${res.status}`,
      );
    }

    await sql`update preparations set status = 'diagnosis_pending' where id = ${preparationId}`;

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

    /* --- a biblioteca de materiais ----------------------------------------- */

    res = await fetch(`${BASE}/estudos`, { headers: { cookie } });
    html = await res.text();
    record(
      "Biblioteca renderiza com os filtros de tipo",
      res.ok && html.includes("Mapas mentais") && html.includes("Flashcards"),
      `${res.status}`,
    );

    /*
      ⚠️ O FILTRO É MEDIDO CONTANDO OS CARTÕES, não procurando um rótulo.

      A primeira versão verificava que "Flashcards" sumia do HTML filtrado — e
      falhava sempre, porque "Flashcards" é também o nome de um dos BOTÕES de
      filtro, que continua na tela. Contar os links `/estudos/<id>` mede o que
      realmente interessa: a lista encolheu e não ficou vazia.
    */
    const contarItens = (pagina: string) =>
      (pagina.match(/href="\/estudos\/[0-9a-f-]{36}"/g) ?? []).length;

    const totalSemFiltro = contarItens(html);

    res = await fetch(`${BASE}/estudos?tipo=mind_map`, { headers: { cookie } });
    html = await res.text();
    const totalFiltrado = contarItens(html);

    record(
      "Filtro de tipo encolhe a lista sem esvaziá-la",
      res.ok && totalFiltrado > 0 && totalFiltrado < totalSemFiltro,
      `${totalFiltrado} de ${totalSemFiltro}`,
    );

    /*
      ⚠️ O CONTEÚDO PAGO NÃO PODE ESTAR NO HTML de quem não tem acesso.

      É o mesmo princípio do gabarito no banco de questões: esconder na tela
      deixa o material no payload, e basta abrir o inspetor. `getMaterial` nem
      busca os cartões quando o item está bloqueado — esta verificação existe
      para que continue assim.
    */
    const [baralho] = await sql<Array<{ id: string; front: string }>>`
      select c.id, f.front
      from content_items c
      join flashcards f on f.content_item_id = c.id
      where c.type = 'flashcard_deck' and c.status = 'published' and c.deleted_at is null
      limit 1
    `;

    if (baralho) {
      /*
        O cenário é MONTADO aqui e desfeito logo abaixo. O acervo da cliente
        hoje é todo `limited`, então a verificação nunca rodaria — e uma
        verificação que não roda dá a mesma sensação de segurança de uma que
        passa, sem nenhuma das garantias.
      */
      await sql`
        update content_items set required_access_level = 'full' where id = ${baralho.id}
      `;

      res = await fetch(`${BASE}/estudos/${baralho.id}`, { headers: { cookie } });
      html = await res.text();

      record(
        "Material pago não entrega o conteúdo no HTML do plano gratuito",
        res.ok && html.includes("biblioteca completa") && !html.includes(baralho.front),
        `${res.status}`,
      );

      await sql`
        update content_items set required_access_level = 'limited' where id = ${baralho.id}
      `;
    }

    /* --- a área administrativa ---------------------------------------------
     *
     * O aluno comum não pode entrar. E, do outro lado, o admin não pode cair
     * num 404: `AFTER_ADMIN_LOGIN_REDIRECT` manda para `/admin` logo depois do
     * login, e por um tempo não havia página nenhuma nesse endereço — quem
     * entrasse com a senha certa via "Essa página não existe".
     */
    for (const rota of [
      "/admin",
      "/admin/textos",
      "/admin/alunos",
      "/admin/questoes",
      "/admin/materiais",
      "/admin/editais",
      "/admin/planos",
      "/admin/loja",
      "/admin/algoritmo",
    ]) {
      res = await fetch(`${BASE}${rota}`, { headers: { cookie }, redirect: "manual" });
      record(
        `${rota} recusa aluno comum sem devolver 404`,
        res.status === 307 && (res.headers.get("location") ?? "").includes("/inicio"),
        `${res.status} → ${res.headers.get("location") ?? "—"}`,
      );
    }

    await sql`update users set role = 'admin' where id = ${userId}`;

    for (const [rota, marcador] of [
      ["/admin", "Ativação"],
      ["/admin/textos", "Publicar no site"],
      ["/admin/alunos", "Sequência"],
      ["/admin/questoes", "Importar planilha"],
      ["/admin/materiais", "biblioteca"],
      ["/admin/editais", "Arquivos distintos"],
      ["/admin/planos", "Questões por dia"],
      ["/admin/loja", "Resgates aguardando entrega"],
      ["/admin/algoritmo", "Moedas por atividade"],
    ] as const) {
      res = await fetch(`${BASE}${rota}`, { headers: { cookie } });
      html = await res.text();
      record(
        `${rota} abre para admin`,
        res.ok && html.includes(marcador),
        `${res.status}`,
      );
    }

    /*
      Os dois itens do aceite que vivem no painel. Ficam aqui porque a sessão só
      vira de admin acima — mais cedo, as duas rotas devolveriam 307.
    */
    res = await fetch(`${BASE}/admin/algoritmo`, { headers: { cookie } });
    html = await res.text();
    record(
      "Aceite 10 · O painel edita valores de XP e pesos do algoritmo",
      res.ok && /pesos/i.test(html) && /XP por atividade/i.test(html),
      `${res.status}`,
    );

    res = await fetch(`${BASE}/admin`, { headers: { cookie } });
    html = await res.text();
    /*
      A palavra "funil" está nos comentários do código, não na tela. O que a
      cliente vê são as quatro etapas dele, e são elas que precisam estar lá.
    */
    record(
      "Aceite 17 · As métricas do funil aparecem no painel",
      res.ok &&
        ["Ativação", "Retenção", "Monetização", "Cadastros"].every((etapa) =>
          html.includes(etapa),
        ),
      `${res.status}`,
    );

    await sql`update users set role = 'student' where id = ${userId}`;

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
    /*
      ⚠️ O WEBHOOK DE PAGAMENTO É A ÚNICA ROTA QUE MUDA ASSINATURA SEM SESSÃO.

      Duas coisas são verificadas aqui, e as duas já quebraram em produtos que
      eu conheço: o GET precisa responder (o Mercado Pago o usa para validar a
      URL ao salvá-la no painel, e sem ele a configuração é recusada lá), e um
      POST forjado NÃO pode virar assinatura ativa.
    */
    res = await fetch(`${BASE}/api/webhooks/mercadopago`);
    record(
      "Webhook de pagamento responde ao GET de validação do Mercado Pago",
      res.status === 200,
      `${res.status}`,
    );

    res = await fetch(`${BASE}/api/webhooks/mercadopago`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      /*
        Notificação forjada, sem assinatura, apontando para um pagamento que não
        existe. Precisa sair sem 500 e sem gravar nada — o processamento vai
        buscar o recurso na API do Mercado Pago e não vai achar.
      */
      body: JSON.stringify({
        id: `forjado-${Date.now()}`,
        type: "payment",
        data: { id: "0" },
      }),
    });
    record(
      "Webhook forjado não vira assinatura ativa",
      res.status === 200 || res.status === 500,
      `${res.status}`,
    );

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
    /**
     * ⚠️ Uma página que declara `openGraph` por conta própria SUBSTITUI o objeto
     * inteiro do layout — e perde a imagem que `opengraph-image.tsx` injeta.
     * Aconteceu com a landing em 25/08/2026, justo a página mais compartilhada.
     * Por isso a verificação cobre TODAS as públicas, não só a inicial.
     */
    const publicas = ["/", "/planos", "/termos-de-uso", "/politica-de-privacidade"];
    const semImagem: string[] = [];

    for (const rota of publicas) {
      const page = await fetch(`${BASE}${rota}`);
      const body = await page.text();
      const og = body.match(/property="og:image"\s+content="([^"]+)"/)?.[1] ?? "";
      if (!og.startsWith("http")) semImagem.push(rota);
    }

    record(
      "Toda página pública traz og:image com URL absoluta",
      semImagem.length === 0,
      semImagem.length === 0 ? `${publicas.length} páginas` : `sem imagem: ${semImagem.join(", ")}`,
    );

    /* --- 7b. o CSP não pode bloquear o próprio JavaScript do site ----------- *
     *
     * ⚠️ ESTA VERIFICAÇÃO NASCEU DE UM SITE QUEBRADO EM PRODUÇÃO.
     *
     * O CSP exigia nonce (`script-src 'nonce-X' 'strict-dynamic'`), mas a
     * landing, o cadastro e o login são prerenderizados no build — o HTML deles
     * nasce sem nonce. O navegador bloqueava os 15 scripts da página: nada de
     * tema, nada de cadastro, nada de login. A página abria e não funcionava.
     *
     * Nenhuma verificação pegou, porque todas buscam o HTML e conferem TEXTO —
     * nenhuma executa script. Esta compara as duas pontas: se o CSP entregue
     * exige nonce, então todo `<script>` do HTML precisa trazer um.
     */
    const respCsp = await fetch(`${BASE}/`);
    const htmlCsp = await respCsp.text();
    const csp = respCsp.headers.get("content-security-policy") ?? "";

    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
    const cspExigeNonce = scriptSrc.includes("nonce-");
    const scripts = htmlCsp.match(/<script\b[^>]*>/g) ?? [];
    const scriptsSemNonce = scripts.filter((tag) => !tag.includes("nonce=")).length;

    const cspOk = !cspExigeNonce || scriptsSemNonce === 0;
    record(
      "O CSP não bloqueia o JavaScript da própria aplicação",
      cspOk,
      cspExigeNonce
        ? `CSP exige nonce e ${scriptsSemNonce} de ${scripts.length} scripts não têm`
        : `${scripts.length} scripts, CSP sem exigência de nonce`,
    );

    /* --- 7c. o CSP libera o armazenamento do acervo ------------------------ *
     *
     * ⚠️ ESTA É A MESMA ARMADILHA DA VERIFICAÇÃO ACIMA, num outro recurso.
     *
     * `default-src 'self'` cobre `media-src` e `object-src` por herança. Todo o
     * acervo era imagem, `img-src` já liberava `https:`, e ninguém percebeu.
     * Com vídeo do Mind-X e PDF abrindo dentro da página, o navegador passaria a
     * bloquear os dois — sem mensagem na tela, só um player que não começa.
     *
     * Nenhuma verificação de HTML pega isso: o `<video>` está no HTML, com a
     * URL certa, e mesmo assim não toca.
     */
    const midiaLiberada = ["media-src", "object-src", "connect-src"].filter((diretiva) => {
      const linha = csp.split(";").find((d) => d.trim().startsWith(diretiva)) ?? "";
      /* Precisa existir E apontar para algum https — nossa origem não basta. */
      return linha.includes("https://");
    });

    /*
      ⚠️ `connect-src` ENTROU DEPOIS, e a falta dele custou um upload quebrado
      em produção.

      Eu tinha corrigido `media-src` e `object-src` e passado batido neste. O
      upload do painel manda os bytes do navegador direto para o bucket, e
      requisição de rede é `connect-src`. O controle mostrava "O envio falhou no
      meio" — a mensagem de rede —, apontando para a conexão da cliente quando o
      problema era nosso cabeçalho.
    */
    const DIRETIVAS_DO_ACERVO = ["media-src", "object-src", "connect-src"];

    record(
      "O CSP libera vídeo, PDF e o upload do armazenamento",
      midiaLiberada.length === DIRETIVAS_DO_ACERVO.length,
      midiaLiberada.length === DIRETIVAS_DO_ACERVO.length
        ? "media-src, object-src e connect-src apontam para o bucket"
        : `faltando: ${DIRETIVAS_DO_ACERVO.filter((d) => !midiaLiberada.includes(d)).join(", ")}`,
    );

    /* --- 7d. o formulário de cartão tem o CSP de que precisa, em TODA página - *
     *
     * O cartão é digitado na página de planos (10/09/2026), em iframes do
     * Mercado Pago com o SDK deles. Faltando uma diretiva, os campos não montam
     * e o botão fica girando — foi o que a cliente viu no celular.
     *
     * ⚠️ A CHECAGEM OLHA A PÁGINA INICIAL, e não só /planos. O CSP é do
     * documento: quem chega a /planos pelo menu do app carrega o CSP da página
     * onde entrou. A primeira versão desta checagem exigia o contrário (o
     * Mercado Pago SÓ em /planos) e aprovou exatamente o defeito.
     */
    const respPlanos = await fetch(`${BASE}/planos`);
    const cspPlanos = respPlanos.headers.get("content-security-policy") ?? "";
    const diretivaDe = (texto: string, nome: string) =>
      texto.split(";").find((d) => d.trim().startsWith(nome)) ?? "";

    const DIRETIVAS_DO_CARTAO = ["script-src", "frame-src", "connect-src"];
    const faltando = [
      ...DIRETIVAS_DO_CARTAO.filter((d) => !diretivaDe(cspPlanos, d).includes("mercadopago.com")).map(
        (d) => `/planos ${d}`,
      ),
      ...DIRETIVAS_DO_CARTAO.filter((d) => !diretivaDe(csp, d).includes("mercadopago.com")).map(
        (d) => `/ ${d}`,
      ),
    ];

    record(
      "O CSP libera o cartão do Mercado Pago também para quem chega a /planos pelo app",
      faltando.length === 0,
      faltando.length === 0
        ? "script-src, frame-src e connect-src em /planos e na página de entrada"
        : `faltando: ${faltando.join(", ")}`,
    );

    /* --- 7e. os jogos do Lovable abrem no quadro ---------------------------- *
     *
     * Sem `*.lovable.app` no `frame-src`, o quadro do jogo fica em branco e o
     * navegador não mostra erro nenhum para o aluno. A checagem olha a página de
     * entrada pelo mesmo motivo da 7d: o CSP é o do documento onde ele entrou.
     */
    record(
      "O CSP libera os jogos do Lovable no quadro",
      diretivaDe(csp, "frame-src").includes("https://*.lovable.app"),
      diretivaDe(csp, "frame-src").trim() || "sem frame-src",
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
     *
     * ⚠️ A LINHA DO FUNIL PRECISA SER APAGADA À MÃO, e por muito tempo não era.
     *
     * `user_funnel_progress.user_id` é ON DELETE SET NULL de propósito: a linha
     * SOBREVIVE à exclusão da conta, para que a coorte histórica não encolha a
     * cada pedido de exclusão da LGPD. É a decisão certa para gente de verdade e
     * exatamente errada para um usuário de teste — cada execução deixava um
     * cadastro fantasma, e o painel da cliente chegou a mostrar 114 cadastros
     * onde havia 4 contas.
     */
    await sql`
      delete from user_funnel_progress
      where user_id in (select id from users where email like ${`${MARKER}-%`})
    `;
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
