# PROGRESSO — O Algoritmo da Aprovação

> Documento vivo. Atualizado a cada incremento entregue.
> **Última atualização:** 20/08/2026 — fim da Sessão 1 (fundação).

## Onde estamos agora

**Fundação construída, schema aprovado, migrations escritas e verificadas, seed
funcionando com o acervo real da cliente. Nenhuma funcionalidade do Marco 1
implementada ainda.**

| Marco | Entrega | Situação |
|---|---|---|
| Fundação | — | ✅ Concluída |
| Banco de dados | — | ✅ Migrations + seed prontos e verificados |
| Marco 1 — Núcleo do produto | 28/08/2026 | ⏳ Pronto para começar |
| Marco 2 — Experiência e administração | 04/09/2026 | ⛔ Não autorizado |

### ✅ Bloqueio resolvido — o banco está no ar

Projeto Supabase criado em **20/08/2026**, com o token de gerenciamento da
cliente. Migrations e seed aplicados.

| | |
|---|---|
| Projeto | `algoritmo-da-aprovacao` |
| Ref | `zzcvkhncelwwtuzxsciz` |
| Região | `sa-east-1` (São Paulo — menor latência para alunos no Brasil) |
| Versão | PostgreSQL 17.6 |
| Plano | Free |
| Aplicação | pooler, porta 6543, `prepare: false` |
| Migrations e backup | conexão direta, porta 5432 |

Estrutura aplicada: **73 tabelas · 55 enums · 242 índices · 127 FKs · 12 CHECKs ·
2 gatilhos** — exatamente o que o `db:verify` previa em Postgres efêmero.

Dados iniciais: 3 planos, 5 níveis, 6 configurações de motor v1, 9 bancas,
7 disciplinas, 57 assuntos, 71 sinônimos, **106 questões** e 5 missões.

⚠️ **A senha do banco só existe no `.env.local`.** O Supabase não a devolve
depois de criada — só permite redefinir, o que quebraria as connection strings.
Guarde-a num gerenciador de senhas.

⚠️ **O token `sbp_` usado na criação tem acesso total à conta** (cria e apaga
projetos). Deve ser revogado no painel do Supabase agora que o projeto existe.

### 🚧 Bloqueio ativo

Nenhum. O que falta é construir as telas e as rotas.

---

## ✅ Concluído

### Etapa A — Scaffold e fundação

| Item | Onde |
|---|---|
| Next.js 16.3 (App Router) + React 19.2 + TypeScript 5 | `package.json` |
| Tailwind CSS v4 (configuração em CSS, sem `tailwind.config.js`) | `src/app/globals.css` |
| shadcn/ui sobre Radix (estilo `radix-nova`) | `components.json` |
| Drizzle ORM + `postgres.js` apontando para o Supabase | `src/server/db/index.ts` |
| Estrutura de pastas modular | `src/{app,components,modules,server,lib,config}` |
| `.env.example` documentado variável por variável | `.env.example` |
| Validação das variáveis de ambiente com falha legível | `src/config/env.ts` |
| Cabeçalhos de segurança em toda resposta | `next.config.ts` |
| CSP com nonce por requisição + esqueleto de proteção de rotas | `src/proxy.ts` |
| Vitest configurado para rodar os motores sem framework | `vitest.config.ts` |
| Regra de lint que impede o domínio de importar framework ou banco | `eslint.config.mjs` |
| Rotina automática de backup + procedimento de restauração | `.github/workflows/database-backup.yml`, `docs/backup-restore.md` |

### Etapa B — Modelagem do banco

Schema completo cobrindo **Marco 1 e Marco 2**, em
`src/server/db/schema/` (15 arquivos por domínio).

**72 tabelas · 54 tipos · 163 índices · 124 chaves estrangeiras.**
Compila sem erro e gera SQL válido (validado gerando para pasta temporária, sem
tocar no banco).

Apresentado para aprovação em **`docs/schema.md`**.

### Etapa C — Design system

| Item | Onde |
|---|---|
| Tokens em 3 camadas: primitivas da marca → semânticas → domínio | `src/app/globals.css` |
| Tema escuro com os hex exatos do README (`#0a0e17`, `#0f1826`, `#1c2b40`, `#22d3ee`, `#dbe4f3`, `#8ea0bd`) | idem |
| Tema claro completo, espelhando a estrutura | idem |
| Cores de domínio: níveis de domínio (🟢🟡🔴) e os 5 níveis de gamificação | idem |
| Glow neon, utilitários de card e área segura do iOS para a barra fixa | idem |
| Provedor de tema com escuro como padrão | `src/components/theme-provider.tsx` |

### Etapa D — Este documento

### O que foi verificado de fato (não só escrito)

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | ✅ sem erros |
| `eslint .` | ✅ sem erros |
| `next build` (produção, Turbopack) | ✅ compila e prerrenderiza |
| Schema gera SQL válido | ✅ 72 tabelas, 54 tipos, 163 índices, 124 FKs |
| Cabeçalhos de segurança na resposta | ✅ CSP com nonce, HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, sem `X-Powered-By` |
| Rota privada sem sessão | ✅ `/inicio` e `/admin` → 307 para o login |
| Rota pública e de auth | ✅ não são redirecionadas |
| Tema escuro aplicado por padrão | ✅ |

---

## ⏳ Marco 1 — o que falta (nada iniciado)

### 1.1 Segurança e LGPD
- [x] **Hashing argon2id + política de senha** — `src/server/auth/password.ts`
- [x] **Geração e verificação de tokens, pseudonimização LGPD** — `tokens.ts`
- [x] **Sessão em banco com revogação imediata** — `session.ts`
- [x] **Guards de autorização, propriedade de recurso e CSRF** — `guards.ts`
- [ ] Telas e rotas que usam tudo isso (precisa de banco)
- [x] Rotina automática de backup *(falta cadastrar o segredo no GitHub)*
- [ ] Recuperação de senha por e-mail com token de validade limitada
- [ ] Exclusão de conta com remoção efetiva (anonimização)
- [ ] Página de Política de Privacidade
- [ ] Consentimento no cadastro com finalidade declarada

### 1.2 Cadastro e autenticação
- [ ] Cadastro com nome, e-mail e WhatsApp
- [ ] Login e logout
- [ ] Recuperação e alteração de senha
- [ ] Alteração de e-mail com confirmação no novo endereço

### 1.3 Landing page pública
- [ ] Página explicando como o Algoritmo funciona

### 1.4 Fluxo do botão "+"
- [ ] Upload do edital em PDF + cargo pretendido
- [ ] Data da prova e disponibilidade de estudo *(acrescentado na Sessão 1)*
- [x] **Extração por IA** — `src/server/ai/`, com structured outputs, detecção
      local de PDF escaneado e mensagens acionáveis ao aluno
- [ ] Tela de revisão: editar, corrigir, excluir e acrescentar
- [ ] Campo de peso do assunto quando o edital não informa
- [ ] Confirmação do conteúdo

### 1.5 Diagnóstico inicial
- [ ] Níveis de domínio por disciplina, com propagação e refino opcional
- [ ] Aviso obrigatório com o texto exato do README

### 1.6 Motor 1 — Tarefa do Dia
- [x] **Módulo puro com os 5 sinais ponderados** — `src/modules/daily-task/signals.ts`
- [x] **Montagem em blocos, rotação de técnica, corte por tempo** — `generate.ts`
- [x] **Suíte de testes** — 75 testes
- [ ] Serviço que persiste a tarefa gerada (precisa de banco)
- [ ] Tela da Tarefa do Dia

### 1.7 Motor 2 — Revisão
- [x] **Módulo puro da curva do esquecimento (24h/7/30/60/90)** — `src/modules/review/engine.ts`
- [x] **Regra de atraso: acumula, próximo intervalo da execução real**
- [x] **Suíte de testes** — 25 testes
- [ ] Serviço que persiste as ocorrências (precisa de banco)
- [ ] Tela "Revisões para Hoje" com botão REVISAR

### 1.8 Cronograma adaptativo
- [x] **Projeção até a data da prova, agregada por semana** — `src/modules/schedule/`
- [x] **Viabilidade: o conteúdo cabe até a prova?** — com quantos minutos a mais por dia
- [x] **Adiantar e atrasar conteúdo** — item movido prevalece sobre o motor
- [x] **Gatilhos de recálculo + explicação ao aluno** — 27 testes
- [ ] Persistência dos snapshots e da janela materializada (precisa de banco)
- [ ] Tela do cronograma

### 1.9 Banco de questões
- [ ] Importador CSV + questões de exemplo (3 disciplinas × 3 bancas)
- [ ] Resposta com comentário explicativo abaixo
- [ ] Filtros de banca, disciplina, assunto e dificuldade
- [ ] Limite diário por plano *(antecipado do Marco 2 a seu pedido)*

### 1.10 Gestão da preparação
- [ ] Múltiplas preparações com o gate do Premium ativo
- [ ] Trocar, editar e encerrar preparação

### Transversal
- [ ] Shell de navegação: menu lateral + barra inferior fixa
- [ ] Instrumentação do funil desde a primeira tela

---

## ⛔ Marco 2 — não autorizado

Modelado no banco, não implementado. Dashboard Home, gamificação, módulos de
conteúdo, planos com Mercado Pago e painel administrativo.

**Não começar sem autorização explícita.**

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

| Risco | Impacto | Como está sendo tratado |
|---|---|---|
| **Prazo do Marco 1** — 9 dias corridos para segurança, auth, IA, dois motores, cronograma e banco de questões | Alto | Fundação construída em uma sessão. O caminho crítico agora são as chaves de terceiros. |
| **Qualidade da extração de edital** — PDFs heterogêneos, alguns escaneados | Alto | `edital_extractions` guarda entrada, saída, custo e versão do prompt para permitir iterar. A tela de correção do aluno é a rede de segurança. |
| **Casamento de taxonomia** | Alto | Três camadas + fila visível no painel. Vale medir a taxa de casamento nos primeiros editais reais. |
| **Auth.js Credentials não suporta sessão em banco** | Médio | Levantado em `docs/schema.md`, aguardando decisão. |
| **Custo da API da Anthropic** | Médio | Custo por execução registrado; `plan_limits.monthly_edital_upload_limit` já modelado como teto. |

---

## Pendências de produto (não técnicas)

1. **Rótulos do Índice de Preparação** — a palavra "Competitivo" agora é nome de
   nível de gamificação e não pode ser reusada no índice. Proposta pendente de
   apresentação ao Eduardo.
2. **Diagnóstico por disciplina com propagação** — decisão de produto, o Eduardo
   vai comunicar à cliente.

---

## Como rodar

```bash
cp .env.example .env.local     # preencha DATABASE_URL e AUTH_SECRET
npm install
npm run dev                    # http://localhost:3000

npm run typecheck              # TypeScript
npm run lint                   # ESLint
npm run test                   # Vitest (motores)

npm run db:generate            # gera a migration  ⚠️ só após aprovação
npm run db:migrate             # aplica no Supabase ⚠️ só após aprovação
npm run db:seed                # popula dados iniciais
```
