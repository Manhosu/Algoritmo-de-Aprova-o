# Modelagem do banco de dados

> **Status: aguardando aprovação do Eduardo. Nenhuma migration foi executada.**
>
> O schema em `src/server/db/schema/` já compila e gera SQL válido
> (72 tabelas, 54 tipos, 163 índices, 124 chaves estrangeiras), mas o comando
> `db:generate` / `db:migrate` só será rodado depois do seu aval.

Cobre o **Marco 1 e o Marco 2 de uma vez**, conforme combinado. O motivo é
direto: gamificação, planos e o funil de métricas se alimentam de eventos que o
Marco 1 já produz. Modelá-los em setembro significaria alterar tabelas com dado
real dentro — ou perder o histórico de agosto.

---

## O caminho do dado, de ponta a ponta

```
  CADASTRO ──▶ PREPARAÇÃO ──▶ EDITAL (PDF) ──▶ IA extrai ──▶ ALUNO CORRIGE
                                                                   │
                                                    ┌──────────────┘
                                                    ▼
                                            CASAMENTO COM O CATÁLOGO
                                            (casou? → tem questão)
                                            (não casou? → FILA DO PAINEL)
                                                    │
                                                    ▼
                                              DIAGNÓSTICO
                                                    │
                              ┌─────────────────────┴─────────────────────┐
                              ▼                                           ▼
                    MOTOR 1 — TAREFA DO DIA                    MOTOR 2 — REVISÃO
                    (decisão tomada hoje)                      (compromisso do passado)
                    5 sinais ponderados                        24h · 7 · 30 · 60 · 90
                              │                                           │
                              └─────────────────┬─────────────────────────┘
                                                ▼
                                    RESPOSTAS E ESTUDOS
                                    (com data, hora e fuso)
                                                │
                              ┌─────────────────┼─────────────────┐
                              ▼                 ▼                 ▼
                      topic_states        rollups diários     eventos do funil
                      (memória dos        (Home, gráficos)    (painel admin)
                       motores)
```

---

## As oito decisões que sustentam o modelo

### 1. A ponte entre as duas taxonomias

O risco ① que levantei na primeira sessão. O edital de cada aluno vem em texto
livre; as questões estão presas a um catálogo. Se as duas não se encontram, a
Tarefa do Dia entrega vazio e a Cobertura do Edital mente.

Resolvido em três camadas, nesta ordem:

| Camada | Tabela | Papel |
|---|---|---|
| 1 | `study_plan_topics.canonical_topic_id` | Casamento direto. Nulo = não casou. |
| 2 | `canonical_topic_aliases` | Sinônimos aprendidos. **Faz o sistema melhorar sozinho.** |
| 3 | `topic_mapping_queue` | A fila do painel, para o que não casou. |

**A fila que você pediu.** `topic_mapping_queue` é **deduplicada por texto
normalizado**: se cinquenta alunos subirem editais com "Emprego do sinal
indicativo de crase", existe **uma** linha com `occurrences = 50` e
`affected_user_count = 50`. O administrador resolve uma vez; a resolução vira um
sinônimo na camada 2; os cinquenta são consertados e os próximos casam sozinhos.
`occurrences` também é a ordem de trabalho — resolve-se primeiro o que trava
mais gente.

`raw_name` (texto do PDF) e `display_name` (o que o aluno editou) são colunas
separadas e o `raw_name` nunca é sobrescrito. Isso permite medir a qualidade da
extração e reprocessar o casamento depois sem perder o original.

### 2. Os dois motores são entidades separadas — e o schema não deixa misturar

| | Motor 1 — Tarefa do Dia | Motor 2 — Revisão |
|---|---|---|
| Natureza | Decisão tomada **hoje** | Compromisso assumido **no passado** |
| Tabelas | `daily_tasks`, `daily_task_items` | `review_schedules`, `review_occurrences` |
| Entrada | 5 sinais ponderados | Uma conclusão de estudo |
| Vence quando | No fim do dia | Na data marcada, independente de tudo |
| Compete por espaço? | Sim, entre si | **Não. Nunca.** |

E dentro do Motor 2, **duas** entidades, não uma:

- `review_schedules` = a **série**. Nasce quando o aluno marca "estudei".
- `review_occurrences` = **cada revisão**. Uma linha por etapa, com vencimento e
  status próprios.

Modelar como uma coisa só — um campo "próxima revisão" na série — destruiria o
histórico: não haveria como saber quais foram feitas, quais foram puladas e
quantos dias de atraso cada uma teve. É exatamente o dado que "Revisões Feitas"
e a aderência do Índice de Preparação consomem.

**Regra de atraso, como você aprovou:** vencida acumula (`is_late`, `days_late`),
o intervalo seguinte conta de `completed_date` e não da data prevista, e
desempenho ruim não reinicia o ciclo — mas fica registrado em
`performance_rating` para a calibração futura ter dado com que trabalhar.

### 3. Data e hora gravadas já convertidas

`question_attempts` tem **três** colunas de tempo, e não é redundância:

| Coluna | Tipo | Para quê |
|---|---|---|
| `answered_at` | `timestamptz` | O instante absoluto — a verdade |
| `answered_date` | `date` | Gráfico de evolução diário |
| `answered_hour` | `smallint` | **Horário de Ouro** |

As duas últimas são gravadas já no fuso do aluno, no momento da escrita.
Converter na leitura significaria conversão de fuso linha a linha sobre o
histórico inteiro, sem usar índice — lento exatamente quando o aluno tem dado
suficiente para a métrica valer alguma coisa. E protege contra o aluno mudar de
fuso: o dia em que ele respondeu continua sendo o dia em que ele respondeu.

O mesmo padrão está em `study_logs`, `usage_sessions`, `xp_ledger` e
`analytics_events`.

### 4. A regra do gráfico vira consequência do modelo

> "No dia em que o aluno não responder questões, o gráfico **NÃO cai** —
> simplesmente **não existe ponto** naquele dia."

`daily_user_rollups` tem **uma linha por aluno por dia com atividade**. O gráfico
plota `questions_correct / questions_answered` das linhas existentes. **Dia sem
linha não vira zero porque não existe nada para virar zero.**

A regra deixa de depender de alguém lembrar dela ao escrever o front.

*Ressalva honesta:* dias com atividade que não é questão (só estudo, só revisão)
geram linha com `questions_answered = 0`. O gráfico precisa filtrar
`questions_answered > 0`. Está documentado no schema e vai estar no módulo de
métricas.

### 5. Configuração versionada e imutável (sua decisão 14)

`engine_configs` guarda os pesos do motor, os valores de XP e os intervalos de
revisão como **versões**, não como linhas editáveis:

- editar **não altera a linha**: cria a versão seguinte;
- uma ativa por tipo, garantido por índice parcial **no banco**, não por
  convenção;
- a partir do primeiro uso a versão é **travada** (`locked_at`);
- `daily_tasks`, `daily_task_items`, `xp_ledger`, `review_schedules`,
  `schedule_snapshots` e `preparation_metrics` guardam o id da versão que os
  produziu.

E `daily_task_items.priority_breakdown` guarda **a contribuição de cada um dos 5
sinais** naquele cálculo. Guardar só o score final não é explicável: "0,82" não
diz nada. É o que alimenta a tela "Entenda o Algoritmo", o que permite responder
"por que este assunto caiu hoje?" e o que torna possível calibrar olhando dado
real em vez de intuição.

### 6. XP é livro-razão, não contador

`xp_ledger` é append-only, uma linha por ganho, saldo = soma. Custa mais espaço
que `users.total_xp += 5` e paga por três coisas:

1. **auditoria** — "por que eu tenho 5.740 XP?" tem resposta linha a linha;
2. **recálculo** — os valores de XP são editáveis pelo painel; com ledger,
   mudar "acerto" de 5 para 8 afeta o futuro sem corromper o passado;
3. **estorno** — resposta anulada, questão removida, correção de importação:
   lança-se a contrapartida, sem "consertar" contador.

Índice único em `(user_id, activity, source_type, source_id)` impede que o mesmo
acerto pague XP duas vezes numa requisição repetida.

`user_gamification_states` é **cache** disso, reconstruível a qualquer momento.

### 7. O funil precisa nascer agora

`analytics_events` (fonte da verdade) + `user_funnel_progress` (funil
materializado, uma linha por usuário, um carimbo por degrau).

Sem a segunda, cada aba do painel faria `count(distinct user_id)` sobre milhões
de eventos, uma vez por degrau, a cada carregamento. Com ela, cada degrau é um
`count(*) where <coluna> is not null` — e a pergunta mais difícil do README,
**"onde abandonam (ponto exato do fluxo)"**, vira `group by last_stage_reached`.

Cobertura dos degraus pedidos no README 2.6:

| Pergunta do painel | Onde |
|---|---|
| Quantos criaram preparação | `preparation_created_at` |
| Quantos subiram edital | `edital_uploaded_at` |
| Quantos concluíram diagnóstico | `diagnosis_completed_at` |
| Quantos responderam a 1ª questão | `first_question_answered_at` |
| Quantos retornaram no dia seguinte | `returned_next_day_at` |
| Onde abandonam | `last_stage_reached` |
| Quais recursos mais utilizam | `feature_usage_rollups` |
| Quantos batem no limite Free | `free_limit_first_reached_at` + `daily_question_usage` |
| Quantos fazem upgrade | `upgraded_at`, `upgraded_to_plan_id` |
| Onde a turma mais erra | `topic_performance_stats` |

### 8. LGPD sem quebrar a métrica (sua decisão 15)

A exclusão de conta **não apaga a linha** de `users`. A rotina:

1. sobrescreve nome, e-mail, WhatsApp e hash de senha;
2. apaga o conteúdo do titular (preparações, respostas, logs);
3. marca `anonymized_at` e `status = 'anonymized'`;
4. anula `analytics_events.user_id` e **preserva `pseudonym_key`**.

`pseudonym_key` é um HMAC irreversível do id original. Sem PII associada, não
identifica ninguém — e a contagem de coortes continua correta. Se os eventos
fossem apagados, "quantos se cadastraram em agosto" daria respostas diferentes
em setembro e em outubro.

`legal_documents` versiona a Política de Privacidade e `user_consents` aponta
para a versão aceita: sem isso, "o usuário consentiu" é afirmação sem prova.

---

## Mapa das tabelas por domínio

### Identidade e acesso — `identity.ts`
`users` · `auth_sessions` · `verification_tokens` · `user_consents` ·
`legal_documents` · `data_deletion_requests` · `data_export_requests` ·
`admin_audit_logs` · `auth_throttle_counters`

`admin_audit_logs` não é enfeite: o painel altera os pesos do motor, os valores
de XP e o plano de um aluno. Sem trilha, "por que o algoritmo mudou de
comportamento na terça?" fica sem resposta.

### Planos e assinatura — `billing.ts`
`plans` · `plan_prices` · `plan_limits` · `plan_content_access` ·
`subscriptions` · `payments` · `payment_webhook_events`

**Regra central:** todo usuário tem sempre **exatamente uma** assinatura ativa,
inclusive no Free — criada no cadastro com `provider = 'manual'` e sem pagamento.
Garantido por índice parcial único. Isso torna "qual o plano deste aluno?" uma
consulta sem caso especial, e faz a métrica de upgrade ser a transição de uma
linha para outra.

`plan_limits.daily_question_limit` e `max_active_preparations` usam **NULL para
ilimitado** — nunca 0 nem número mágico. Free 10/1, Intermediário 20/1,
Premium NULL/NULL.

`payment_webhook_events` existe por idempotência: o Mercado Pago reenvia
notificação, e sem o índice único a mesma cobrança estende a assinatura duas
vezes.

### Catálogo canônico — `catalog.ts`
`exam_boards` · `canonical_subjects` · `canonical_topics` ·
`canonical_topic_aliases` · `canonical_subject_aliases`

### Preparação — `preparation.ts`
`preparations` · `preparation_availability` · `preparation_documents` ·
`edital_extractions` · `study_plan_subjects` · `study_plan_topics` ·
`topic_mapping_queue` · `diagnostics` · `diagnostic_responses` ·
`topic_states` · `preparation_metrics`

`topic_states` é a **memória de trabalho dos motores**: uma linha por assunto do
edital, com desempenho, recência, cobertura e o último score de prioridade. A
Tarefa do Dia precisa ordenar 300 assuntos no celular, em tempo de carregar
tela — reagregar milhares de respostas a cada abertura não fecha a conta. É
derivada e reconstruível a partir do histórico.

`edital_extractions` guarda tokens e custo estimado por execução. A infra é paga
pela cliente e proporcional ao uso; sem isso não há como responder "quanto está
custando" nem detectar um edital de 400 páginas queimando orçamento.

`preparation_availability` (uma linha por dia da semana) é o que você pediu:
sem ela o Motor 1 entrega 8 horas de tarefa para quem estuda 2.

### Motores e cronograma — `daily-task.ts`, `review.ts`, `schedule.ts`
`daily_tasks` · `daily_task_items` · `review_schedules` · `review_occurrences` ·
`schedule_snapshots` · `schedule_entries`

**Cronograma em duas camadas**, porque materializar dia a dia até uma prova a
dez meses geraria centenas de linhas por aluno, obsoletas em uma semana:

- `schedule_entries` — janela materializada (14 dias). É o que o aluno arrasta.
- `schedule_snapshots` — projeção agregada até a prova, um JSONB por recálculo,
  com `reason`. Guardar o anterior permite dizer **o que mudou e por quê** — um
  cronograma que muda sem explicação é indistinguível de um cronograma quebrado.

`schedule_entries.source = 'student_moved'` faz a escolha do aluno prevalecer
sobre o motor no recálculo seguinte. Sem isso, arrastar um item pareceria não
funcionar.

**Ancoragem:** `daily_tasks.anchored_at` congela a ordem da tarefa assim que o
aluno começa. O cronograma continua adaptativo, mas o dia em execução não se
reescreve debaixo dele.

### Questões — `questions.ts`
`questions` · `question_options` · `question_import_batches` ·
`question_attempts` · `daily_question_usage` · `topic_performance_stats`

`daily_question_usage` faz duas coisas de uma vez: aplica o limite do plano com
um SELECT por chave única (você pediu no Marco 1 justamente para não costurar
depois) e responde à métrica "quantos atingem o limite do Free" via
`limit_reached_at` — o instante de maior intenção de upgrade do produto.

`plan_id` e `limit_at_time` guardam o plano e o teto **daquele dia**: se o limite
do Free mudar de 10 para 15, o histórico continua contando a verdade.

`question_import_batches` torna a importação reversível — importar 2.000
questões com assunto errado sem saber quais foram é um problema sem solução
barata.

### Estudo e permanência — `study.ts`
`study_logs` · `usage_sessions` · `daily_user_rollups` · `daily_platform_rollups`

`study_logs` é o **gatilho do Motor 2** (sua decisão 5): gravar aqui cria a série
de revisões.

`usage_sessions` mede permanência real por **sinal de vida**, não por
entrada/saída. É a métrica mais fácil de inflar do produto — o aluno que deixa a
aba aberta durante a novela "estudou 3 horas" se a medição for ingênua. Aba em
segundo plano não conta; sem sinal por N minutos a sessão fecha **no último
sinal**, não no momento em que a rotina rodou; há teto por sessão.

### Gamificação — `gamification.ts`
`levels` · `xp_ledger` · `coin_ledger` · `user_gamification_states` ·
`streak_days` · `achievements` · `user_achievements` · `missions` ·
`user_daily_missions` · `store_items` · `store_redemptions`

`levels` é tabela e não enum porque os nomes **já mudaram uma vez** neste
projeto (o mockup dizia "NÍVEL 4 AVANÇADO"; a escada atual é Iniciante /
Competitivo / Estrategista / Elite / Implacável). Vão mudar de novo, e não podem
exigir deploy. `max_xp` nulo no último nível é o que faz "10.000+" funcionar sem
número mágico.

`streak_days` existe separado dos rollups porque o streak precisa ser
**reconstruível**: um contador incrementado quebra em qualquer falha de escrita
e ninguém descobre até o aluno reclamar que perdeu 27 dias.

### Conteúdo — `content.ts`
`content_items` · `flashcards` · `content_progress` · `trails` · `trail_steps` ·
`user_trail_progress`

A regra dos filtros está garantida pelo modelo: `content_items` se classifica
pelo catálogo canônico e **não tem nenhuma referência a `preparations`**. Não
existe caminho no schema que permita restringir o acervo ao edital do aluno — a
restrição precisaria ser inventada, não apenas esquecida. O que limita é o
plano, via `plan_content_access`.

`content_items.image_width/height` estão ali para o visualizador com zoom do
mapa mental.

### Telemetria — `analytics.ts`
`analytics_events` · `user_funnel_progress` · `feature_usage_rollups` · `job_runs`

`job_runs` registra a execução das rotinas (rollups, fechamento de sessões
órfãs, geração da Tarefa do Dia, backup). Job que falha em silêncio é a causa
mais comum de métrica errada: a tela não quebra, ela só passa a mentir.

---

## Convenções aplicadas em todo o schema

| Convenção | Motivo |
|---|---|
| PK **UUID** nas entidades | Ids aparecem em URL; sequência inteira vaza volume e permite enumerar |
| PK **bigint identity** em `analytics_events`, `xp_ledger`, `coin_ledger` | Append-only, nunca exposta, localidade de índice importa |
| **`timestamptz` sempre**, nunca `timestamp` | Guardamos o instante absoluto; conversão só na borda |
| Coluna **`date` separada**, em modo string | "Dia" é o dia em Brasília; ler como string evita o `Date` do JS reintroduzir fuso |
| **`deleted_at`** em vez de DELETE | Preserva integridade do histórico; a remoção LGPD é feita por anonimização |
| **Dinheiro em centavos** (`integer`) | Nunca float |
| **NULL = ilimitado** nos limites de plano | Sem número mágico |
| Colunas em **snake_case**, TypeScript em **camelCase** | `casing: "snake_case"` no drizzle; SQL idiomático e TS idiomático sem repetir nome |
| Enum do Postgres só para domínio **fechado e estável** | O que a operação edita no dia a dia é linha em tabela, senão o painel exigiria migration |

---

## ⚠️ Uma decisão que preciso da sua confirmação antes de seguir

Você aprovou **"Auth.js + Credentials + argon2 + Drizzle"**, e é o que estou
seguindo. Mas ao modelar a sessão encontrei uma limitação do Auth.js que muda
uma coisa e prefiro te contar agora:

**O provider Credentials do Auth.js só funciona com sessão em JWT — ele não
suporta sessão em banco.** É uma limitação documentada da biblioteca, não uma
escolha nossa.

A consequência prática é específica e cai bem em cima do que o README exige:
com JWT, **o token continua válido até expirar mesmo depois de o titular pedir
exclusão da conta** ou de trocar a senha. Não há como derrubar a sessão do lado
do servidor, porque não existe nada no servidor para derrubar.

Isso conflita com dois itens do Marco 1: "exclusão de conta e dados (com remoção
efetiva)" e "sessões protegidas".

Modelei `auth_sessions` (sessão em banco, com hash do token, `revoked_at` e
expiração) porque é o que atende ao requisito. As opções:

**A) Sessão em banco, com a camada de sessão escrita por nós** *(o que o schema
já suporta — minha recomendação)*
Mantém argon2, mantém Drizzle, mantém as tabelas nossas. Permite derrubar acesso
na hora do pedido de exclusão, encerrar todas as sessões ao trocar a senha e
mostrar ao aluno onde ele está logado. Custo: cerca de 150 linhas de código de
sessão que passam a ser nossas para manter — é código sensível, e assumo que
seja revisado com cuidado.

**B) Auth.js com Credentials + JWT, ao pé da letra do que foi aprovado**
Menos código nosso. Para atender à exclusão efetiva seria preciso uma consulta
ao banco por requisição validando se a sessão ainda vale — o que devolve o custo
do banco e mantém a complexidade da biblioteca. Na prática, o pior dos dois.

Recomendo **A**. Se você preferir **B**, eu faço — mas registro que a exclusão
de conta passa a ter um atraso igual ao tempo de vida do token, e isso precisa
constar na Política de Privacidade.

O schema **não muda** com essa escolha: `auth_sessions` só fica sem uso na
opção B.

---

## O que acontece depois do seu "pode ir"

1. `npm run db:generate` — gera o SQL da migration inicial em `drizzle/`
2. Você revisa o SQL gerado, se quiser
3. `npm run db:migrate` — aplica no Supabase
4. `npm run db:seed` — popula planos, níveis, configuração inicial dos motores
   (pesos e XP do README como versão 1), bancas, catálogo inicial e as questões
   de exemplo (3 disciplinas × 3 bancas × 3 dificuldades)
