# Checklist: dados reais e planos

Auditoria feita em 26/08/2026, a pedido do Eduardo: **nenhum dado mock na
interface**, tudo vindo do banco e sincronizado com o que o servidor aplica de
fato.

O critério usado foi mais estrito do que "não é mock": um número só é aceitável
se a tela que o mostra e a regra que o aplica **lêem a mesma fonte**. Número
correto vindo de fonte separada é bug esperando a próxima mudança.

---

## 1. Painel do aluno (Home)

Antes desta rodada a Home mostrava quatro números. O mockup da cliente pede
treze blocos. Todos foram ligados a dado real:

| Bloco | Fonte | Estado |
|---|---|---|
| Nível e barra de XP | `levels` + `user_gamification_states` | ✅ |
| XP total / XP de hoje | `user_gamification_states`, `xp_ledger` | ✅ |
| Horas estudadas | `daily_user_rollups.study_minutes` | ✅ |
| Questões resolvidas e % de acerto | `question_attempts` | ✅ |
| Revisões feitas / pendentes | `daily_user_rollups`, `review_occurrences` | ✅ |
| Moedas | `user_gamification_states.coin_balance` | ✅ |
| Desempenho por disciplina | `topic_states` agregado por disciplina | ✅ |
| Índice de Preparação | `preparation_metrics` | ✅ |
| Sequência + faixa da semana | `user_gamification_states`, `streak_days` | ✅ |
| Missões do Dia | motor da Tarefa do Dia | ✅ |
| Revisões para hoje | `getReviewsToday` | ✅ |
| Evolução (gráfico) | `daily_user_rollups` → `buildEvolutionSeries` | ✅ |
| Melhor técnica | `daily_task_items` × `question_attempts` | ✅ |

**Nenhum card inventa número.** Quando o dado ainda não existe, o card explica
por quê em vez de mostrar zero: um "78/100" no primeiro dia de uso ensinaria o
aluno a não confiar nos números, e o produto inteiro depende de ele confiar.

### Defeito encontrado e corrigido

"Questões resolvidas" saía de `question_attempts` e o percentual de acerto
saía dos rollups diários. Como o rollup é calculado por job e a tentativa é
gravada na hora, o painel exibia **"0 questões resolvidas" ao lado de "91% de
acerto em Direito Constitucional"** — dois cards se contradizendo na mesma
tela. Agora as duas respostas saem de `question_attempts`.

---

## 2. Planos: preços, benefícios e limitações

Conferido README × banco × página.

### Preços — conferem

| Plano | README | Banco | Página |
|---|---|---|---|
| Free | Grátis | — | Grátis ✅ |
| Intermediário mensal | R$ 69,90 | 6990 | R$ 69,90 ✅ |
| Intermediário anual | R$ 419,40 | 41940 | ✅ *(era invisível)* |
| Premium mensal | R$ 89,90 | 8990 | R$ 89,90 ✅ |
| Premium anual | R$ 539,40 | 53940 | ✅ *(era invisível)* |

**O plano anual estava cadastrado, ativo e escondido.** A consulta filtrava só
`monthly` e descartava a linha anual em silêncio — a oferta de 50% do README
não existia para quem abria a página. Agora aparece como equivalente mensal
(R$ 34,95 e R$ 44,95), porque ninguém divide 419,40 por 12 de cabeça para
comparar com o número ao lado.

### Limites — um estava anunciado e não era aplicado

| Limite | Página | Servidor |
|---|---|---|
| Questões por dia (10 / 20 / ∞) | ✅ | ✅ `questions/service.ts` |
| Preparações ativas (1 / 1 / ∞) | ✅ | ✅ `checkPreparationLimit` |
| Leituras de edital por mês (2 / 5 / ∞) | ✅ | ✅ `checkEditalUploadLimit` **← novo** |

O limite de leituras de edital era anunciado na página **desde sempre, sem
nenhum código aplicando**. Não era só informação errada: cada leitura é uma
chamada paga à API da Anthropic, então era um buraco de custo que apareceria na
fatura antes de aparecer em qualquer relatório. O gate agora roda **antes** de
o arquivo ir para o Storage — checar depois significaria pagar a leitura para
então dizer "não pode".

⚠️ Ele conta **tentativas**, não sucessos: uma extração que falhou já queimou os
tokens do documento.

---

## 3. Pendências que dependem da cliente

**O tagline "acervo ampliado"** (plano Intermediário) e a tabela do README que
promete Mapas Mentais / Flashcards / Videoaulas como *Limitado → Ampliado →
Completo* descrevem uma diferenciação que **existe no banco mas não é aplicada
em lugar nenhum**: as tabelas `plan_content_access` e
`content_items.required_access_level` estão populadas, e nenhuma consulta de
leitura filtra por elas. Hoje todo aluno vê o mesmo acervo.

Isso é Marco 2 (biblioteca de materiais), mas **o tagline já está no ar
prometendo**. Duas saídas, e a escolha é da Natália:

1. implementar o filtro de acervo por plano junto com a biblioteca; ou
2. mudar o tagline no banco enquanto a diferenciação não existe.

O tagline sai de `plans.tagline`, então trocar é mexer em dado dela — não fiz
por conta própria.

---

## 4. O que continua sendo ilustrativo, de propósito

O painel "Sua tarefa de hoje" da **landing pública** mostra um exemplo fixo
(Mapa Mental — Crase, Concordância verbal). É uma demonstração do produto para
quem ainda não tem conta, não o dado de ninguém — o equivalente à foto do
produto na embalagem. Está em HTML e não em imagem justamente para acompanhar
mudanças de layout sem envelhecer.

Se preferir que a landing mostre dados agregados reais ("X questões respondidas
esta semana"), é uma decisão diferente e dá trabalho novo — hoje não há volume
que torne esse número impressionante.
