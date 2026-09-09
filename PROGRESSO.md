# PROGRESSO — O Algoritmo da Aprovação

> Documento vivo. Atualizado a cada incremento entregue.
> **Última atualização:** 08/09/2026 — Marco 2 concluído, Mind-X no ar.

## Onde estamos agora

**Marco 1 e Marco 2 estão no ar, e o Mind-X junto. Os 17 itens do checklist de
aceite do Marco 2 passam, conferidos no HTML de produção.**

| Marco | Entrega | Situação |
|---|---|---|
| Fundação | — | ✅ Concluída |
| Banco de dados | — | ✅ 74 tabelas, migrations e seed aplicados |
| Marco 1 — Núcleo do produto | 28/08/2026 | ✅ **Concluído em 24/08** |
| Marco 2 — Experiência e administração | 04/09/2026 | ✅ **Concluído em 06/09** |
| Mind-X — extensão contratada à parte | 08/09/2026 | ✅ **No ar em 08/09** |

### O que existe além do Marco 1

Dashboard com as métricas, gamificação completa (XP, moedas, níveis, sequência,
conquistas, Loja, Ranking e Trilhas), biblioteca de materiais, painel
administrativo, planos com Mercado Pago por assinatura recorrente, e o **Mind-X**:
o feed de vídeos curtos escolhido pelas lacunas do aluno, com 29 vídeos da
cliente publicados.

⚠️ **O pagamento está em modo de TESTE.** `MERCADOPAGO_ACCESS_TOKEN` na Vercel
guarda a credencial de teste, então o Mercado Pago recusa qualquer pagador real.
O painel avisa disso em `/admin/planos`, com o nome da conta em uso. Trocar pela
credencial de produção e fazer um deploy novo é o que falta para cobrar de
verdade — a credencial antiga circulou em texto e precisa ser girada junto.

### O caminho que o aluno percorre hoje

Cadastro → disponibilidade de estudo → cria a preparação → sobe o PDF do edital
→ a IA extrai o conteúdo programático → o aluno confere e corrige → faz o
diagnóstico → **recebe as Missões do Dia** → estuda → as revisões nascem em 24h,
7, 30, 60 e 90 dias → responde questões com comentário → o cronograma se refaz.

Tudo isso roda ponta a ponta. Nenhuma tela é maquete.

### Checklist de aceite do Marco 1

| # | Item | |
|---|---|---|
| 1 | Cadastro com nome, e-mail e WhatsApp | ✅ |
| 2 | Landing page explicativa antes do login | ✅ |
| 3 | Sobe PDF de edital e a IA extrai disciplinas e assuntos | ✅ |
| 4 | Editar, corrigir, excluir e acrescentar itens extraídos | ✅ |
| 5 | Preencher o peso quando o edital não informa | ✅ |
| 6 | Diagnóstico com os 3 níveis e o aviso obrigatório | ✅ |
| 7 | Tarefa do Dia coerente com o diagnóstico e os pesos | ✅ |
| 8 | Revisões em 24h/7/30/60/90, separadas da Tarefa do Dia | ✅ |
| 9 | Cronograma muda quando o aluno estuda ou responde | ✅ |
| 10 | Responde questão e vê o comentário abaixo | ✅ |
| 11 | Filtros de banca, disciplina, assunto e dificuldade | ✅ |
| 12 | Recuperação de senha, troca de e-mail, exclusão de conta | ✅ |
| 13 | Política de Privacidade publicada e consentimento no cadastro | ✅ |

### Como isso é verificado

Cinco camadas, cada uma pegando o que a anterior não pega:

| Comando | O que prova | Números |
|---|---|---|
| `npm run typecheck` + `lint` | tipos e regras de arquitetura | 0 erros |
| `npm run test` | as regras dos motores, sem banco | **311 testes** |
| `npm run db:verify` | migrations e invariantes em Postgres efêmero | ok |
| `npm run verify:engine` | as regras contra o Postgres real | **50 verificações** |
| `npm run verify:account` | senha, e-mail e exclusão, incluindo os caminhos de ataque | **25 verificações** |
| `npm run smoke` | as telas respondendo por HTTP, com sessão real | **21 verificações** |
| `npm run verify:edital -- x.pdf` | leitura de um edital real, com chamada de IA | ⚠️ gasta ~4 centavos |
| `npm run build` | build de produção | 22 rotas |

Os scripts limpam tudo que criam — inclusive os rollups de estatística de turma e
os itens que acrescentaram à fila global de mapeamento. Depois de rodar todos, o
banco fica com **0 usuários e 0 itens na fila**.

### Bugs que só apareceram ao executar

Nenhum destes aparecia no `typecheck`, no `lint` ou nos testes de unidade.

| O que era | Como se manifestava |
|---|---|
| **Pooler de transação trava com 4 consultas simultâneas** | Requisição pendurada até o timeout da função. Sem erro, sem log. Várias telas fazem exatamente quatro leituras em paralelo. Trocado para o pooler de sessão (5432). |
| **Numeração do edital quebrava o casamento** | "3 Emprego do sinal indicativo de crase" não casava com o catálogo por causa do "3". Casamento de 21% num edital que o catálogo cobre — o aluno não receberia questão e a fila encheria de itens já resolvíveis. |
| **`NULL` no limite do plano virava 1** | Aluno **Premium** via "seu plano permite 1 preparação ativa" e era limitado a 10 questões por dia. `?? 1` não distingue "coluna nula de propósito" de "linha ausente". |
| **XP pago em dobro** | Responder a mesma questão de novo pagava XP outra vez: a chave de idempotência era o id da tentativa, e cada resposta cria uma nova. |
| **`Date` cru dentro de `sql`** | Virava `Date.toString()`, que o Postgres recusa. Quebrava concluir estudo e bater o limite diário. |
| **Client component importando módulo de servidor** | Arrastava o driver `postgres` para o bundle do navegador. Área do aluno inteira em HTTP 500. |
| **Manifest redirecionado para o login** | O proxy interceptava `.webmanifest`; o navegador o busca sem cookie e recebia HTML. "Adicionar à tela inicial" quebrava em silêncio. |
| **Menu levando a 404** | `/estudos`, `/trilhas`, `/ranking`, `/loja`, `/perfil` e mais três são telas do Marco 2. Ficaram visíveis e desabilitadas. |
| **React 19 limpa o formulário que ele governa** | O `action={}` reseta os campos quando a ação TERMINA, inclusive recusando. Em formulário de edição os campos voltavam ao valor ANTIGO. Cinco formulários passaram a chamar a ação do `onSubmit`. |
| **Constante exportada de arquivo `use client`** | O servidor recebe uma referência, não o valor. A Biblioteca respondia 500 em produção; build, typecheck e lint passavam. Virou guarda. |
| **CSP herdando `default-src` para mídia** | `media-src`, `object-src` e `connect-src` não eram declarados. Vídeo do Mind-X, PDF na tela e o próprio upload eram bloqueados pelo navegador, sem mensagem. |
| **Cronograma distribuindo minutos** | Dia sem conteúdo quando o acumulado não fechava um bloco, e assunto partido entre dois dias quando a estimativa passava do teto. Passou a contar assuntos. |
| **Assunto estudado continuava no cronograma** | Discreto enquanto a distribuição era por minutos; contando assuntos, ele voltava a ocupar uma vaga inteira no dia seguinte. |

### O que está pronto mas depende da cliente

| Pendência | De quem | Situação |
|---|---|---|
| **Credencial de produção do Mercado Pago** | Eduardo | A Vercel guarda a credencial de TESTE, então nenhum pagador real consegue assinar. A antiga circulou em texto e precisa ser girada. Depois de trocar, é preciso um deploy novo: variável de ambiente só vale para deploy novo. `/admin/planos` mostra qual conta está no ar. |
| Pagamento real com cartão | Natália | Falta uma assinatura de verdade no checkout, depois da credencial de produção entrar. |
| 16 vídeos do Mind-X sem disciplina no nome | Natália | Chegaram como "Sem título 2026-08-27 22.25.19" e "WhatsApp Video…". Renomeados no padrão "Disciplina - Assunto", entram num comando. |
| PDF desenhado dentro da tela no celular | Natália decide | Chrome e Safari de celular não embutem PDF. Hoje ele abre no visualizador do aparelho. Desenhar em `<canvas>` resolveria, e é trabalho a mais. |
| Catálogo canônico incompleto | Natália | Cada assunto cadastrado rende questão a mais. A fila do painel é a lista do que falta, e a importação de questões e de flashcards passou a criar assunto novo sozinha. |
| Acervo de questões e materiais | Natália | O card "Acervo de Estudos" mostra a cobertura ao aluno. Materiais, flashcards e vídeos entram pelo painel, por upload ou planilha. |
| Edital real para conferência final | Natália | A leitura foi verificada com um PDF gerado que imita os defeitos de um edital real. Falta rodar com um documento de banca de verdade. |

---

## ⏳ Marco 1 — detalhamento

### 1.1 Segurança e LGPD
- [x] Hashing argon2id + política de senha — `src/server/auth/password.ts`
- [x] Tokens com hash SHA-256, pseudonimização LGPD — `tokens.ts`
- [x] Sessão em banco com revogação imediata — `session.ts`
- [x] Guards de autorização, propriedade de recurso e CSRF — `guards.ts`
- [x] Rotina automática de backup
- [x] **Recuperação de senha por e-mail**, token de 1 hora, uso único
- [x] **Exclusão de conta** com 7 dias de janela e pseudonimização irreversível
- [x] Página de Política de Privacidade
- [x] Consentimento no cadastro com a versão do documento gravada

### 1.2 Cadastro e autenticação
- [x] Cadastro com nome, e-mail e WhatsApp
- [x] Login e logout (logout revoga a sessão no banco)
- [x] Recuperação e alteração de senha
- [x] Alteração de e-mail com confirmação no endereço novo + aviso no antigo

### 1.3 Landing page pública
- [x] Página explicando o diferencial: edital → IA → diagnóstico → plano

### 1.4 Fluxo do botão "+"
- [x] Passo 1: cargo, órgão, banca e data da prova
- [x] Passo 2: upload do PDF, com assinatura do arquivo conferida no servidor
- [x] Extração por IA — structured outputs, detecção local de PDF escaneado
- [x] Passo 3: revisão do conteúdo — editar, corrigir, excluir, acrescentar
- [x] Campo de peso do assunto, com a origem do peso registrada
- [x] Passo 4: confirmação (renomear um assunto **refaz** o casamento)

### 1.5 Diagnóstico inicial
- [x] Níveis por disciplina, propagados para os assuntos
- [x] Aviso obrigatório com o texto exato do README *(o smoke compara palavra por palavra)*
- [x] Trava definitiva — não se refaz, e a tela avisa disso antes do clique

### 1.6 Motor 1 — Tarefa do Dia
- [x] Módulo puro com os 5 sinais ponderados
- [x] Blocos com técnica prescrita, rotação, corte por tempo
- [x] Serviço que persiste, idempotente por dia
- [x] Missões do Dia na Home, clicáveis, riscando ao concluir

### 1.7 Motor 2 — Revisão
- [x] Módulo puro da curva do esquecimento (24h/7/30/60/90)
- [x] Regra de atraso: acumula, próximo intervalo conta da execução real
- [x] Serviço que persiste — só a primeira etapa nasce agendada
- [x] Tela "Revisões para Hoje" com botão REVISAR e o atraso visível

### 1.8 Cronograma adaptativo
- [x] Projeção semanal até a prova, calculada na leitura
- [x] Viabilidade com o número de minutos por dia que faltam
- [x] Gatilhos de recálculo + explicação ao aluno
- [x] Tela do cronograma

### 1.9 Banco de questões
- [x] Importador de planilha + as 106 questões da cliente no banco
- [x] Resposta com comentário explicativo logo abaixo
- [x] Filtros de banca, disciplina, assunto e dificuldade
- [x] Limite diário por plano *(antecipado do Marco 2)*
- [x] Gabarito **não** viaja com a página — só depois de responder

### 1.10 Gestão da preparação
- [x] Múltiplas preparações com o gate do Premium ativo
- [x] Trocar, renomear e encerrar — encerrar não apaga e libera a vaga

### Transversal
- [x] Shell de navegação: menu lateral + barra inferior fixa
- [x] Instrumentação do funil desde o cadastro
- [x] Tema escuro por padrão, claro suportado

---

## ✅ Marco 2 — concluído em 06/09/2026

Dashboard com as métricas, gamificação inteira, módulos de conteúdo, planos com
Mercado Pago e painel administrativo, incluindo a fila de mapeamento.

Os 17 itens do checklist de aceite são conferidos por `npm run smoke` contra o
HTML de produção, e não por memória.

## ✅ Mind-X — no ar em 08/09/2026

Contratado à parte. Feed de vídeos curtos no estilo Stories, recortado pelo
edital do aluno e ordenado pelas lacunas dele. O botão central da barra inferior
abre o feed; o "+" de nova preparação foi para "Minhas preparações".

A regra de escolha é pura e testada (`modules/mindx/select`). O acervo tem 29
vídeos da cliente, importados por `npm run mindx:import`.

⚠️ **Vídeo do Google Drive não funciona, e não é defeito nosso.** Link de
compartilhamento devolve uma página HTML, não o arquivo, e a tag `<video>` não
toca HTML. Por isso o cadastro de material ganhou upload direto ao bucket, e o
formulário recusa link de página para vídeo e áudio.

---

## Decisões técnicas tomadas

### Sessão 1 — 19/08/2026

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Catálogo canônico como ponte**, com sinônimos e fila de não mapeados | Sem isso a Tarefa do Dia entrega vazio e a Cobertura do Edital mente. A fila deduplicada faz uma resolução consertar todos os alunos afetados. |
| 2 | **Schema do Marco 2 modelado junto com o do Marco 1** | XP e funil se alimentam de eventos que o Marco 1 já produz. Modelar depois significaria alterar tabelas com dado real dentro ou perder o histórico de agosto. |
| 3 | **Data e hora civis gravadas em coluna própria** | Horário de Ouro e gráfico diário agrupam por hora/dia local. Converter fuso na leitura não usa índice. |
| 4 | **Um dia sem atividade não gera linha de rollup** | Faz a regra "dia sem questão não plota ponto" ser consequência do modelo, não lembrança de quem escreve o front. |
| 5 | **Configuração dos motores versionada e travada após uso** | Pesos e XP são editáveis pelo painel. Sem versão, a tarefa de ontem fica inexplicável hoje. *(Sua decisão 14.)* |
| 6 | **`priority_breakdown` guarda a contribuição dos 5 sinais** | "0,82" não é explicável. Alimenta a tela "Entenda o Algoritmo" e permite calibrar com dado real. |
| 7 | **XP como livro-razão, não contador** | Auditoria, recálculo após mudança de valores e estorno sem corromper histórico. |
| 8 | **Todo usuário tem sempre uma assinatura ativa, inclusive no Free** | "Qual o plano deste aluno?" vira consulta sem caso especial; upgrade vira transição de linha. |
| 9 | **Anonimização em vez de DELETE, com `pseudonym_key` irreversível** | Atende à LGPD sem fazer o denominador do funil encolher com o tempo. *(Sua decisão 15.)* |
| 10 | **Cronograma em duas camadas: janela materializada + projeção agregada** | Materializar dia a dia até uma prova a dez meses gera centenas de linhas obsoletas em uma semana. |
| 11 | **Tarefa do dia é ancorada ao ser iniciada** | O plano continua adaptativo, mas o dia em execução não se reescreve debaixo do aluno. |
| 12 | **Permanência medida por sinal de vida, não por entrada/saída** | Aba esquecida aberta viraria "3 horas estudadas". Métrica que mente é pior que métrica nenhuma. |
| 13 | **Pureza do domínio garantida por lint** | Convenção escrita se perde na terceira semana. Como regra de lint, vira erro de build. |
| 14 | **Tokens de design em 3 camadas, dois temas desde já** | Refazer cor depois de 40 telas é retrabalho garantido. |
| 15 | **`casing: "snake_case"` no Drizzle** | TypeScript idiomático e SQL idiomático sem repetir o nome de cada coluna duas vezes. |
| 16 | **Proxy só redireciona; autorização é sempre no servidor** | A própria documentação do Next.js 16 avisa que Server Functions escapam do matcher. Proxy sozinho é falsa sensação de proteção. |

### Sessão 2 — 20/08/2026 (revisão dirigida do schema)

O Eduardo recusou aprovar 72 tabelas em bloco e pediu walkthrough de 6 pontos de
risco. A revisão encontrou 6 falhas reais no modelo, corrigidas antes da
migration:

| # | Decisão | Por quê |
|---|---|---|
| 17 | **`users.pseudonym_key` é APAGADA na anonimização** | Era o furo mais grave. Com a chave viva na linha do usuário, bastava consultar `users` para religar os eventos a uma pessoa — sem precisar do segredo. A irreversibilidade era retórica, não técnica. Apagando a chave, a ponte é destruída. |
| 18 | **`user_funnel_progress` chaveada pela pseudônima, não pelo `user_id`** | Com PK em `user_id`, a linha do funil morria junto com a conta e o denominador histórico encolhia a cada exclusão — o problema que a decisão 9 dizia resolver. |
| 19 | **Dois CHECKs de PII em `users`** | `users_identity_required_check` e `users_anonymized_scrubbed_check`. O banco recusa uma conta anonimizada que ainda tenha nome, e-mail, telefone, hash ou avatar. Exclusão efetiva vira invariante, não promessa. |
| 20 | **`payments` e `subscriptions` com `onDelete: restrict`** | Registro financeiro tem prazo de guarda fiscal. Um cascade acidental destruiria a evidência. |
| 21 | **`priority_breakdown` guarda sinais brutos E contribuições** | Só as contribuições respondem "por que hoje?". Os sinais brutos respondem "e se a urgência valesse 40%?" — calibração vira simulação sobre dado gravado, não chute. |
| 22 | **`daily_tasks.engine_config_id` obrigatório + `restrict`** | Tarefa sem configuração é inexplicável; apagar configuração usada torna o histórico inexplicável em massa. As duas coisas ficaram impossíveis pelo banco. |
| 23 | **`preparations.locked_by_plan_at` — queda de plano bloqueia, nunca apaga** | Não havia resposta no modelo para "Premium com 3 preparações cai para Free". Apagar dado do aluno porque o cartão falhou seria a pior decisão possível de retenção, e não está no README. |
| 24 | **Regra de lint proíbe os dois motores de se importarem** | "Estão separados" precisa ser verificável. Agora qualquer import entre `modules/daily-task` e `modules/review` quebra o build. |
| 25 | **Sessão própria; `next-auth` removido do desenho** | Ver a análise no walkthrough: com sessão em banco, o Auth.js não entrega nada e vira superfície sem garantia. |
| 26 | **Postgres local via Docker** | Desenvolvimento não fica bloqueado esperando o Supabase da cliente. Ver `docs/ambiente-local.md`. |
| 27 | **Extração de edital: `claude-opus-5` + structured outputs** | Operação mais crítica do produto, roda uma vez por preparação. Custo por leitura é irrelevante perto de uma extração torta. |

### Sessão 3 — 20/08/2026 (marca, acervo e decisões da cliente)

| # | Decisão | Por quê |
|---|---|---|
| 28 | **Disponibilidade de estudo migra para o USUÁRIO** (`user_availability`) | Pedido da cliente: entra no cadastro do perfil, editável a qualquer momento. E é o modelo correto: um aluno Premium com dois editais tem 2h por dia, não 2h para cada. O motor distribui o orçamento entre as preparações ativas. |
| 29 | **Diagnóstico só por disciplina e TRAVADO após concluir** | Decisão da cliente ("para não interferir nas métricas"). Combina com o que `topic_states` já fazia: `initial_mastery` congelado, `current_mastery_score` evoluindo com o desempenho real. Um erro de clique se corrige sozinho. |
| 30 | **Diagnóstico completo é pré-requisito para ativar a preparação** | Consequência da 29: sem refino posterior, diagnóstico parcial congelaria dado incompleto. São ~10–15 disciplinas, não 300 assuntos. |
| 31 | **Assinatura da marca trocada por CSS, não por JavaScript** | Ler o tema no cliente exigiria componente client-side, guarda de montagem e faria a logo piscar no primeiro render. Com `dark:`, as duas versões vão no HTML e o navegador escolhe. |
| 32 | **Padrão editorial da cliente versionado em `docs/`** | A aba "Prompt" da planilha é a especificação de qualidade do acervo. As validações do importador saem direto da §12 dela. |

### Sessão 4 — 20/08/2026 (execução das recomendações)

| # | Decisão | Por quê |
|---|---|---|
| 33 | **`next-auth` e `@auth/drizzle-adapter` removidos** | Com sessão em banco, o Auth.js não entregava nada além do nome — e um mantenedor futuro assumiria que a segurança estava coberta por ele. Biblioteca de auth pela metade é pior que nenhuma. |
| 34 | **Gatilhos de imutabilidade em `engine_configs`** (`0001_...sql`) | A trava só na camada de repositório não resiste a um UPDATE pelo Supabase Studio nem a um script de correção. Agora nem o próprio verificador consegue alterar uma configuração travada. |
| 35 | **Limite diário falha ABERTO** | Se a resolução do plano falhar por problema de infraestrutura, o aluno responde a questão e o incidente é registrado. Bloquear quem paga por falha nossa é dano de retenção real; um aluno Free responder 11 questões não é dano nenhum. |
| 36 | **`fflate` + leitor próprio de .xlsx, em vez de biblioteca completa** | As opções populares trazem 90+ pacotes transitivos, vários sem manutenção, num endpoint que recebe upload de arquivo. O template é nosso e só tem texto. |
| 37 | **PGlite para verificar migrations e seed sem banco** | "Compila" e "gera SQL válido" não provam que a migration APLICA. Gatilho escrito à mão só falha no `CREATE`. Roda no CI e antes de tocar o banco da cliente. |
| 38 | **Comparação de alternativas duplicadas NÃO remove acento** | Bug real encontrado ao rodar o seed: 89 das 95 questões de crase foram rejeitadas porque `à qualquer hora` e `a qualquer hora` viravam a mesma string. Num banco de português, o acento é a diferença que a questão testa. |
| 39 | **Política de Privacidade entra como rascunho não publicado** | O texto descreve com precisão o que o sistema faz — inclusive as duas exceções à "exclusão total" (métrica anonimizada e guarda fiscal). Mas é rascunho técnico, não parecer jurídico: `is_current = false` impede publicação por acidente. |
| 40 | **Disponibilidade por preparação, não implementada como divisão manual** | Com múltiplas preparações, o orçamento diário do aluno é dividido pelo motor com peso para a prova mais próxima (`schedule_params.urgencyAllocationExponent`), em vez de pedir ao aluno que reparta percentuais. |

### Sessão 5 — 20/08/2026 (Tarefa do Dia em blocos)

Proposta da cliente, aplicada no schema (migration `0002`).

| # | Decisão | Por quê |
|---|---|---|
| 41 | **Tarefa do Dia em BLOCOS de estudo + prática, sobre o mesmo assunto** (`daily_task_items.block_index`) | Emparelhar não é estético: é o que torna "Melhor técnica de estudo" atribuível. A prática vem logo depois do estudo, no mesmo assunto, então o desempenho é imputável à técnica recém-usada. |
| 42 | **A técnica passa a ser PRESCRITA pelo sistema** (`daily_task_items.technique`), não só registrada | Quando o aluno escolhe, a métrica mede a dificuldade do assunto, não a eficácia da técnica: flashcard vai para o que é fácil, videoaula para o que é difícil. Com prescrição rotativa, a comparação passa a ser feita dentro do mesmo assunto. É a diferença entre observar e medir. |
| 43 | **Quantidade de questões não é exibida no bloco** (`study_techniques.showQuestionCount = false`) | No Free o teto é 10/dia. Anunciar "responda 15 questões" seria prometer o que o plano não entrega. A meta continua existindo internamente para dimensionar o dia. |
| 44 | **Item fechado por limite de plano conta como CUMPRIDO** (`closed_by_plan_limit`) | Quem estudou tudo que o plano permitia não pode ver tarefa incompleta em vermelho. Vira o gancho natural de upgrade, no momento de maior intenção. |
| 45 | **Nova configuração versionada `study_techniques`** | Quais técnicas entram na rotação, com que política de repetição e qual o fallback quando não há material. Editável pelo painel — desligar videoaula enquanto o acervo de vídeo está vazio não pode exigir deploy. |

### Sessão 6 — 20/08/2026 (login com Google)

⚠️ **Escopo novo, fora do README.** Pedido da cliente, autorizado pelo Eduardo
com a justificativa de que adicionar OAuth depois custa muito mais caro —
mexe em `users`, na criação de sessão e no fluxo de cadastro.

| # | Decisão | Por quê |
|---|---|---|
| 46 | **OAuth implementado por nós, sem reintroduzir o Auth.js** | Voltar com a biblioteca só para o Google criaria dois sistemas de sessão convivendo: dois cookies, duas expirações, duas histórias de revogação. O fluxo Authorization Code + PKCE são ~180 linhas e mantém uma sessão só. É a revisita que ficou pendente na decisão 33, e a conclusão não mudou. |
| 47 | **O Google autentica; a sessão continua sendo nossa** (`user_identities`) | Se a sessão fosse do Google, o pedido de exclusão de conta não derrubaria o acesso na hora e a promessa de remoção efetiva ficaria falsa. |
| 48 | **Nenhum token do Google é armazenado** | Escopo pedido é só `openid email profile`; não há nada a acessar em nome do aluno depois do login. Credencial guardada sem uso é só passivo em caso de vazamento. |
| 49 | **Vinculação automática exige e-mail verificado dos DOIS lados** | Unir contas por e-mail coincidente é vetor clássico de tomada de conta. Sem verificação nos dois lados, pede-se a senha. |
| 50 | **Login com Google NÃO pula WhatsApp, consentimento nem disponibilidade** | O Google entrega nome, e-mail e foto — não entrega telefone. O ganho real é não ter senha para criar e ter o e-mail já verificado, não pular o cadastro. |
| 51 | **`GOOGLE_CLIENT_*` são opcionais** | Sem elas o botão não aparece e o login por senha segue funcionando. Recurso de conveniência não pode impedir a aplicação de subir. |
| 52 | **URL de produção reservada: `algoritmo-da-aprovacao.vercel.app`** | Passada à cliente antes de o projeto existir, para ela cadastrar as duas URIs no Google de uma vez só e não haver segunda ida e volta. **O projeto na Vercel precisa se chamar exatamente `algoritmo-da-aprovacao`** — outro nome quebra o login com `redirect_uri_mismatch`. |

### Sessão 7 — 21/08/2026 (primeiras telas e ajustes de escopo)

| # | Decisão | Por quê |
|---|---|---|
| 53 | **Login com Google REMOVIDO da UI** | Decisão da cliente: o Google não entrega telefone, e ela quer garantir o WhatsApp de todo mundo. A tabela e as variáveis ficam; desfazer a migration custaria mais do que vale. **Reduz escopo — ajuda o prazo.** |
| 54 | **Manifesto do site fora do matcher do proxy** | Bug encontrado ao testar: o navegador busca o manifesto SEM cookie de sessão, o proxy redirecionava para o login e devolvia HTML no lugar do JSON. O "Adicionar à tela de início" quebrava em silêncio. |
| 55 | **Percentual de acervo disponível vs em produção** | Ideia da cliente. Barato porque o dado já existe. ⚠️ É uma promessa: dizer "20% em produção" compromete a operação a produzir aqueles 20%. |
| 56 | **Política de privacidade renderizada por parser próprio** | O texto é editável pelo painel; `dangerouslySetInnerHTML` numa página que todo visitante abre seria XSS a partir de conta de admin comprometida. |
| 57 | **Cadastro NÃO pergunta disponibilidade de estudo** | É a tela onde mais se perde gente. A pergunta vai para o primeiro passo do onboarding, depois de a conta existir. |

### ⏸ Ideias da cliente adiadas, com motivo

| Ideia | Por que não agora |
|---|---|
| **Trilhas com Dominado/Em andamento/Não dominado + "Comprovar Proficiência"** | Não é dificuldade técnica — o motor já exclui assunto `mastered`. É que o teste precisa de ~30 questões por assunto, e o acervo tem 106 questões quase todas de Crase. Construir agora seria construir algo que não pode ser usado nem testado. |
| **Notificações no sino (XP, tarefa concluída, envio pelo painel)** | Marco 2 (README 2.1 e 2.6). A tabela `notifications` já existe. |

### ⚠️ Compromissos assumidos com terceiros

Coisas que já foram ditas à cliente e que o código precisa honrar:

| Compromisso | Onde isso obriga |
|---|---|
| Projeto na Vercel se chamará `algoritmo-da-aprovacao` | Criação do projeto de deploy |
| A rota de callback será `/api/auth/google/callback` | Implementação do OAuth |
| A Política de Privacidade ficará em `/politica-de-privacidade` | Marco 1, seção 1.1 |
| Os Termos de Uso ficarão em `/termos-de-uso` | Marco 1 |
| Login com Google coleta WhatsApp, consentimento e disponibilidade numa etapa de conclusão | Fluxo de cadastro do Marco 1 |

### Domínio e e-mail

**Domínio registrado em 20/08/2026: `oalgoritmodaaprovacao.com.br`**

Ele destrava duas cadeias que estavam paradas:

| Cadeia | Estado |
|---|---|
| domínio → DNS no Resend → e-mail para qualquer aluno | ⏳ 3 registros DNS pendentes (`docs/email.md`) |
| domínio → política publicada → tela do Google publicada → login liberado | ⏳ depende da política ir ao ar |

O domínio já está **cadastrado no Resend** (região `sa-east-1`, id
`4f4a7b0f-5a4b-4039-a29c-82451d92dc63`). Falta só adicionar os registros DNS no
painel do domínio. `npm run email:check` diz o estado a qualquer momento.

⚠️ Enquanto o DNS não propagar, o e-mail de recuperação de senha só entrega
para `oalgoritmodaaprovacao@gmail.com`. O **item 12 do checklist de aceite não
pode ser dado como pronto** antes disso.

### Decisões que dependem de terceiros

| Item | Situação | Bloqueia |
|---|---|---|
| Acervo de questões da cliente | Eduardo vai perguntar | Nada — seguimos com CSV + exemplos |
| Chave do Resend | Aguardando | Testar recuperação de senha ponta a ponta (aceite 12) |
| Chave da Anthropic | Aguardando | Testar extração de edital real (aceite 3) |
| Segredo `DATABASE_URL_DIRECT` no GitHub | Aguardando | O backup automático rodar de verdade |
| Projeto Supabase criado | Aguardando | Aplicar a migration |

---

## Riscos em acompanhamento

| Risco | Impacto | Situação em 24/08/2026 |
|---|---|---|
| **Casamento de taxonomia** | Alto | **Medido.** 54% num edital que imita um real, depois de duas correções. Os 46% restantes são buraco de catálogo, não defeito de código — a fila do painel é a lista do que cadastrar. Vale medir de novo no primeiro edital de banca de verdade. |
| **Acervo raso** | Alto | 106 questões, quase todas de Crase. O produto funciona, mas a maioria dos assuntos mostra "questões em produção". É trabalho de conteúdo da cliente. |
| **Qualidade da extração de edital** | Médio | Verificada com chamada real: acertou disciplinas, hierarquia, pesos, data estimada e IGNOROU a seção de bibliografia. `edital_extractions` guarda entrada, saída, custo e versão do prompt para permitir iterar. |
| **`after()` não é fila de verdade** | Médio | Se o processo morrer no meio da leitura, a extração fica em `running` e ninguém a retoma. O arquivo já está guardado e a tela oferece reenviar. Fila real (Inngest, QStash) é o próximo passo se a taxa de falha justificar. |
| **Pooler de sessão em vez de transação** | Médio | Escolha forçada: o de transação trava com 4 consultas simultâneas. Segura uma conexão do servidor por cliente, então o `max` fica baixo. Se a concorrência crescer, aumentar o pool no painel do Supabase — não voltar para o 6543. |
| **Custo da API da Anthropic** | Baixo | 4 centavos de dólar por edital pequeno, registrado por execução. `plan_limits.monthly_edital_upload_limit` já modelado como teto. |
| **Auth.js retirado** | Resolvido | A sessão é própria, em banco. O Auth.js não entrega nada nesse desenho e saiu. |

---

## Pendências de produto (não técnicas)

1. **Rótulos do Índice de Preparação** — a palavra "Competitivo" agora é nome de
   nível de gamificação e não pode ser reusada no índice. Proposta pendente.
2. **Comprovação de proficiência** — a cliente autorizou em 21/08. Precisa de
   ~30 questões por assunto para o resultado significar algo; o acervo tem 106
   no total. Fica para depois do acervo crescer.
3. **Edital real de banca** para conferência final da leitura.

---

## Como rodar

```bash
cp .env.example .env.local     # preencha DATABASE_URL, AUTH_SECRET e as chaves
npm install
npm run dev                    # http://localhost:3000
```

### Validação

```bash
npm run typecheck              # TypeScript
npm run lint                   # ESLint (inclui as regras de pureza dos módulos)
npm run test                   # Vitest — 571 testes das regras dos motores
npm run db:verify              # migrations e invariantes em Postgres efêmero

npm run verify:engine          # 64 verificações contra o Postgres real
npm run verify:account         # verificações de senha, e-mail e exclusão
npm run verify:billing         # 10 verificações do ciclo de assinatura na API real
npm run smoke                  # 79 verificações de tela por HTTP
npm run build                  # build de produção

# Contra produção, com uma sessão real criada e removida no fim:
SMOKE_BASE_URL=https://oalgoritmodaaprovacao.com.br npx tsx scripts/smoke-flow.ts
```

### Banco

```bash
npm run db:generate            # gera a migration
npm run db:migrate             # aplica
npm run db:seed                # popula dados iniciais (idempotente)
npm run db:status              # retrato do banco
npm run db:ping                # testa as duas conexões
npm run catalog:sync           # leva disciplinas, assuntos e sinônimos ao banco
```

### Acervo

```bash
npm run mindx:import -- "<pasta>"              # confere sem gravar
npm run mindx:import -- "<pasta>" --confirmar  # grava e publica

# Materiais e flashcards têm importação por planilha DENTRO do painel,
# em /admin/materiais. O script existe para carga inicial:
npx tsx --conditions=react-server scripts/import-content.ts <pasta> <tipo> "<Disciplina>"
```

### Operação

```bash
npm run email:check            # verificação do domínio no Resend
npm run deletions:run          # executa as exclusões de conta vencidas (cron diário)

# ⚠️ Gasta dinheiro — chamada real à API da Anthropic (~4 centavos):
npx tsx scripts/make-sample-edital.ts edital.pdf
npm run verify:edital -- edital.pdf
```
