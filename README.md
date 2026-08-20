# O Algoritmo da Aprovação — Especificação de Desenvolvimento

Plataforma web de estudo inteligente para concurseiros, com leitura automática de edital por IA, dois motores independentes (priorização e revisão), banco de questões comentadas, gamificação e painel administrativo.

---

## ⚠️ INSTRUÇÕES PARA O AGENTE DE DESENVOLVIMENTO

**LEIA ESTA SEÇÃO ANTES DE ESCREVER QUALQUER CÓDIGO.**

### Regras de execução

1. **O trabalho está dividido em 2 MARCOS.** Você deve construir **APENAS o MARCO 1** primeiro. Não avance para o MARCO 2 sem autorização explícita.
2. **Ao concluir 100% do MARCO 1, PARE e AVISE.** Não comece o MARCO 2 por conta própria. Emita o aviso no formato descrito abaixo.
3. **Ao concluir 100% do MARCO 2, PARE e AVISE** no mesmo formato.
4. **Não invente funcionalidades** que não estejam neste documento. Se algo parecer faltando, pergunte antes de implementar.
5. **Não implemente itens da seção "FORA DO ESCOPO"** em nenhuma hipótese.
6. Antes de dar um item como concluído, verifique-o contra o checklist do marco correspondente.

### Formato do aviso de conclusão de marco

Ao terminar um marco, emita exatamente este bloco:

```
🏁 MARCO [N] CONCLUÍDO

Entregue:
- [lista de todos os itens do checklist, com ✅]

Pendências / decisões que precisam do Eduardo:
- [qualquer bloqueio, dúvida ou item que dependa de terceiros]

Como testar:
- [passo a passo para validar a entrega]

Aguardando autorização para iniciar o MARCO [N+1].
```

### Stack obrigatória

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js (App Router) + React + TypeScript |
| Estilo | Tailwind CSS |
| Backend | Node.js (API Routes do Next.js) |
| Banco de dados | PostgreSQL |
| Leitura de edital | API da Anthropic (Claude) com leitura de PDF |
| Pagamentos | Mercado Pago (assinatura recorrente, Pix e cartão) |
| Autenticação | Sessão segura com senha criptografada (bcrypt/argon2) |

**Requisitos transversais:** responsivo (mobile + desktop, mobile-first), tema claro/escuro, arquitetura modular e escalável.

---

## 📋 CONTEXTO DO PRODUTO

O aluno faz upload do edital do concurso em PDF. A IA lê e estrutura o conteúdo programático em disciplinas e assuntos. O aluno revisa e corrige essa leitura, faz um autodiagnóstico de domínio, e a partir daí a plataforma gera automaticamente a **Tarefa do Dia** e um **Cronograma Adaptativo** que se recalcula a cada interação.

O diferencial é o motor: o aluno não monta o próprio planejamento — o sistema monta para ele e reajusta conforme o desempenho real.

---

# 🎯 MARCO 1 — NÚCLEO DO PRODUTO

> **Entrega prevista:** sexta-feira, 28/08/2026
> **Objetivo:** ter o fluxo completo funcionando de ponta a ponta — do cadastro até a Tarefa do Dia gerada pelo motor.

## 1.1 Fundação: Segurança e LGPD

Implementar **desde a primeira linha de código**, não como etapa posterior.

- [ ] Autenticação segura (senhas com hash, sessões protegidas)
- [ ] Controle de acesso com separação clara entre perfil **aluno** e perfil **administrador**
- [ ] Proteção de todas as APIs (endpoints autenticados e com validação de entrada)
- [ ] Rotina automática de backup do banco de dados
- [ ] Recuperação de senha por e-mail com token de validade limitada
- [ ] Exclusão de conta e dados (direito do titular, com remoção efetiva)
- [ ] Página de Política de Privacidade
- [ ] Adequação à LGPD: consentimento no cadastro, finalidade declarada, direitos do titular

## 1.2 Cadastro e Autenticação

- [ ] Cadastro de aluno com: **nome, e-mail e WhatsApp** (os três obrigatórios)
- [ ] Login e logout
- [ ] Recuperação de senha
- [ ] Alteração de senha
- [ ] Alteração de e-mail (com confirmação no novo endereço)

## 1.3 Página de Apresentação (pré-login)

- [ ] Landing page pública, antes do login, explicando **como o Algoritmo da Aprovação funciona**
- [ ] Deve comunicar o diferencial: upload do edital → IA estrutura → diagnóstico → plano de estudo automático

## 1.4 Fluxo do Botão "+" (criação de preparação)

O botão "+" fica na barra de navegação inferior, no centro. Ao clicar, inicia uma nova preparação:

- [ ] **Passo 1:** Upload do edital em PDF + informar o cargo pretendido
- [ ] **Passo 2:** IA lê o PDF e extrai disciplinas e assuntos, organizando o conteúdo programático
- [ ] **Passo 3:** Formulário estruturado com tudo que a IA extraiu, permitindo ao usuário **editar, corrigir, excluir e acrescentar** itens
- [ ] **Passo 3b:** Campo de **peso do assunto**. Quando o edital informa o peso (quantidade de questões por tema), a IA preenche automaticamente. Quando o edital **não** informa, o campo fica disponível para o usuário preencher manualmente nesta tela de confirmação
- [ ] **Passo 4:** Confirmação do conteúdo pelo usuário
- [ ] **Passo 5:** Diagnóstico inicial

## 1.5 Diagnóstico Inicial

- [ ] Para cada disciplina/assunto, o aluno informa seu nível de domínio:
  - 🟢 Alto domínio
  - 🟡 Domínio mediano
  - 🔴 Baixo domínio
- [ ] Esses dados alimentam diretamente o Motor da Tarefa do Dia
- [ ] **Exibir este aviso na tela de diagnóstico, com este texto exato:**

> *"O nível de domínio informado neste diagnóstico é uma percepção inicial sobre o seu conhecimento. Ele será continuamente validado e atualizado pelo Algoritmo da Aprovação conforme você resolver questões, realizar revisões e evoluir na preparação."*

## 1.6 MOTOR 1 — Tarefa do Dia

⚠️ **Este motor é SEPARADO do motor de revisão. Não misturar as duas lógicas.**

- [ ] Cálculo de priorização próprio (regra de negócio explícita, não delegar à IA — precisa ser previsível e explicável)
- [ ] Cruza 5 sinais, com **pesos configuráveis pelo painel administrativo**:

| Sinal | Peso padrão |
|---|---|
| Desempenho do aluno | 30% |
| Peso do assunto no edital | 20% |
| Urgência (proximidade da prova) | 20% |
| Recência do estudo | 15% |
| Lacunas de conhecimento | 15% |

- [ ] Gera automaticamente a **Tarefa do Dia**: o que estudar, quais assuntos priorizar, quais questões responder
- [ ] Recalcula conforme o desempenho do aluno evolui

## 1.7 MOTOR 2 — Revisão (Curva do Esquecimento)

⚠️ **Motor independente. NÃO incluir na lógica da Tarefa do Dia — é a tela de Revisões, com regra própria.**

- [ ] Agenda revisões em intervalos crescentes a partir do estudo do conteúdo:
  - 24 horas
  - 7 dias
  - 30 dias
  - 60 dias
  - 90 dias
- [ ] Tela "Revisões para Hoje" listando o que vence no dia, com botão **REVISAR** por item
- [ ] Cada item mostra: nome do assunto + disciplina de origem

## 1.8 Cronograma Adaptativo

- [ ] Visão de tudo que está agendado para o aluno estudar **até o dia da prova**
- [ ] **Totalmente adaptativo, nunca estático.** Recalcula quando o aluno:
  - responde questões
  - estuda um conteúdo
  - faz revisões
  - adianta conteúdo do próximo dia
  - atrasa algum dia

## 1.9 Banco de Questões

- [ ] Cadastro e importação de questões
- [ ] **Questões comentadas:** ao responder, exibir breve explicação logo abaixo
- [ ] Filtros: **banca, disciplina, assunto e nível de dificuldade**
  - ⚠️ O filtro de banca deve permitir ver questões de **outras bancas** além da do edital do aluno (se limitar só à banca do edital, pode haver pouco conteúdo)
- [ ] Registro automático de acertos, erros e histórico de desempenho por usuário

## 1.10 Gestão da Preparação

- [ ] Suporte a **múltiplas preparações** (mais de um edital) na modelagem de dados
- [ ] Restrição: múltiplas preparações liberadas **apenas no plano Premium**
- [ ] Tela de gerenciamento: trocar, editar ou encerrar uma preparação

---

## ✅ CHECKLIST DE ACEITE DO MARCO 1

Antes de avisar a conclusão, confirme que **TODOS** funcionam de ponta a ponta:

1. Um novo usuário consegue se cadastrar com nome, e-mail e WhatsApp
2. Ele vê a landing page explicativa antes de logar
3. Ele clica no "+", sobe um PDF de edital real e a IA extrai disciplinas e assuntos
4. Ele consegue editar, corrigir, excluir e adicionar itens extraídos
5. Ele consegue preencher o peso de um assunto quando o edital não informa
6. Ele faz o diagnóstico com os 3 níveis de domínio e vê o aviso obrigatório
7. O sistema gera uma Tarefa do Dia coerente com o diagnóstico e o peso dos assuntos
8. As revisões são agendadas em 24h / 7 / 30 / 60 / 90 dias, separadamente da Tarefa do Dia
9. O Cronograma Adaptativo muda quando o aluno estuda ou responde questões
10. O aluno responde uma questão e vê o comentário explicativo abaixo
11. Os filtros de banca, disciplina, assunto e dificuldade funcionam
12. Recuperação de senha, alteração de senha/e-mail e exclusão de conta funcionam
13. Política de Privacidade publicada e consentimento coletado no cadastro

**➡️ AO CONCLUIR: PARE, emita o aviso 🏁 MARCO 1 CONCLUÍDO e aguarde autorização.**

---

# 🎯 MARCO 2 — EXPERIÊNCIA, GAMIFICAÇÃO E ADMINISTRAÇÃO

> **Entrega prevista:** sexta-feira, 04/09/2026
> **Só iniciar após autorização explícita do Eduardo.**

## 2.1 Dashboard Home

Topo da página:
- [ ] **Nome do estudante** (não usar "Concurseiro" genérico)
- [ ] **"Faltam X dias para a prova"**
- [ ] Sino de notificações, contador de streak e avatar

Cards de métricas:
- [ ] **XP Total** (com ganho do dia)
- [ ] **Horas Estudadas** — tempo total que o usuário fica no site (medir permanência real)
- [ ] **Questões Resolvidas** (com % de acertos)
- [ ] **Revisões Feitas**
- [ ] **Moedas** (usadas na Loja)
- [ ] **Índice de Preparação** ⚠️ (renomeado — NÃO usar "Índice de Aprovação")
- [ ] **Horário de Ouro** — identifica a faixa de horário com maior rendimento do aluno
- [ ] **Cobertura do Edital** — gráfico circular com % do edital já estudado
- [ ] **Lacunas** — assuntos com maior percentual de erros
- [ ] **Desempenho por Disciplina** — barras de progresso com %
- [ ] **Melhor técnica de estudo**

Gráfico de Evolução:
- [ ] Baseado no **percentual de acertos diário**
- [ ] ⚠️ **REGRA CRÍTICA:** no dia em que o aluno não responder questões, o gráfico **NÃO cai** — simplesmente **não existe ponto** naquele dia. Não plotar zero.

Outros blocos:
- [ ] **Missões do Dia** com progresso (ex: 3/5 concluídas) e XP por missão
- [ ] **Revisões para Hoje** com botão REVISAR
- [ ] **Sequência Atual** (streak) com recorde e marcação dos dias da semana
- [ ] **Acesso Rápido** com atalhos para os módulos

## 2.2 Navegação e Interface

Menu lateral (nesta ordem):
- [ ] Home
- [ ] Estudos
- [ ] Questões
- [ ] Revisões
- [ ] **Cronograma Adaptativo** *(link novo)*
- [ ] **Entenda o Algoritmo** *(link novo)*

Barra inferior:
- [ ] Home | Trilhas | **[ + ]** | Ranking | Loja
- [ ] ⚠️ **A barra inferior é FIXA** — permanece sempre visível conforme a tela rola

Menu do avatar (canto superior direito):
- [ ] Meu Perfil
- [ ] ⚙️ Configurações
- [ ] 🔔 Notificações
- [ ] 💬 Feedback & Suporte
- [ ] ❓ Central de Ajuda
- [ ] ─────────────
- [ ] 🚪 Sair

Interface:
- [ ] **Tema Claro / Escuro** com alternância pelo usuário
- [ ] Responsivo para mobile e desktop

## 2.3 Gamificação

Níveis (nomes e faixas de XP exatos):

| Nível | Faixa de XP |
|---|---|
| 🌱 Iniciante | 0 – 999 XP |
| 🎯 Competitivo | 1.000 – 2.999 XP |
| 🧠 Estrategista | 3.000 – 5.999 XP |
| 🔥 Elite | 6.000 – 9.999 XP |
| 👑 Implacável | 10.000+ XP |

Pontuação por atividade:

| Atividade | XP |
|---|---|
| 📚 Estudo concluído | +30 XP |
| ❓ Questão respondida | +5 XP |
| ✅ Acerto | +5 XP bônus |
| 🔥 Dia de constância (streak) | +20 XP |
| 🏆 Meta diária concluída | +50 XP |
| 🔁 Revisão realizada | +40 XP |

- [ ] ⚠️ **Acertar vale mais que apenas responder** (questão respondida +5, acerto soma +5 de bônus = 10 no total)
- [ ] ⚠️ **Todos os valores de XP acima devem ser editáveis pelo painel administrativo**, sem alterar código
- [ ] Streak (sequência de dias), conquistas e barra de progresso para o próximo nível
- [ ] Moedas acumuladas, gastas na Loja

## 2.4 Módulos de Conteúdo

- [ ] **Flash Cards** — cartões pergunta/resposta
- [ ] **Mapas Mentais** — ⚠️ a imagem deve **abrir na tela com possibilidade de zoom/aproximação**
- [ ] **Videoaulas** — player integrado
- [ ] **Estudos** — conteúdo teórico
- [ ] **Trilhas** — percursos de estudo
- [ ] **Ranking** — comparativo entre alunos por XP e consistência
- [ ] **Loja** — resgate de moedas

⚠️ **REGRA DOS FILTROS (correção importante da cliente):**
Flashcards, Mapas Mentais e Videoaulas têm filtro por **disciplina e assunto**, mas **NÃO devem mostrar apenas os vinculados ao edital do aluno** — o acervo fica **aberto para o aluno visualizar todos**.

## 2.5 Planos de Assinatura (Mercado Pago)

| Plano | Mensal | Anual (50% OFF) | Equivale a |
|---|---|---|---|
| Free | Grátis | — | — |
| Intermediário | R$ 69,90 | R$ 419,40 | R$ 34,95/mês |
| Premium | R$ 89,90 | R$ 539,40 | R$ 44,95/mês |

Diferenças entre planos (**apenas** quantidade de questões por dia e acesso a materiais):

| Recurso | Free | Intermediário | Premium |
|---|---|---|---|
| Upload do edital | ✅ | ✅ | ✅ |
| Diagnóstico | ✅ | ✅ | ✅ |
| Trilhas personalizadas | ✅ | ✅ | ✅ |
| Tarefa do dia | ✅ | ✅ | ✅ |
| Revisões | ✅ | ✅ | ✅ |
| Desempenho | ✅ | ✅ | ✅ |
| Gamificação | ✅ | ✅ | ✅ |
| **Questões por dia** | **10** | **20** | **Ilimitado** |
| Mapas Mentais | Limitado | Ampliado | Completo |
| Flashcards | Limitado | Ampliado | Completo |
| Videoaulas | Limitado | Ampliado | Completo |
| Biblioteca de materiais | Limitada | Ampliada | Completa |
| **Mais de uma preparação** | ❌ | ❌ | ✅ |

- [ ] Página de planos com comparativo
- [ ] Integração Mercado Pago: assinatura recorrente, Pix e cartão
- [ ] Fluxo de renovação, cancelamento e tratamento de falha de cobrança
- [ ] Bloqueio automático ao atingir o limite diário do plano

## 2.6 Painel Administrativo

Área separada, acesso restrito à equipe. Abas:
**Visão Geral | Questões | Materiais | Alunos | Planos | Editais | Algoritmo**

Gestão de conteúdo:
- [ ] Cadastro, edição e **importação de questões em lote via planilha Excel**
- [ ] Comentário/explicação e nível de dificuldade por questão
- [ ] Upload e gestão de materiais: PDF, videoaula, mapa mental, flashcard, áudio
- [ ] **Acesso a todos os editais enviados pelos alunos**

Configuração:
- [ ] **Pesos do Motor da Tarefa do Dia editáveis** (desempenho 30%, edital 20%, urgência 20%, recência 15%, lacunas 15%)
- [ ] **Valores de XP por atividade editáveis**
- [ ] Regras de cada plano de assinatura

Métricas — **funil completo de todos os cadastrados**:

*Ativação*
- [ ] Quantos usuários criaram preparação
- [ ] Quantos fizeram upload do edital
- [ ] Quantos concluíram o diagnóstico
- [ ] Quantos responderam a primeira questão

*Retenção*
- [ ] Quantos retornaram no dia seguinte
- [ ] Quantos completam as tarefas
- [ ] Onde abandonam (ponto exato do fluxo)
- [ ] Quais recursos mais utilizam

*Monetização*
- [ ] Quantos atingem o limite do plano Free
- [ ] Quantos fazem upgrade

*Operação*
- [ ] Alunos ativos, questões no banco, materiais cadastrados, acerto médio da turma
- [ ] Onde a turma mais erra (ranking de assuntos com maior % de erro)
- [ ] Progresso, XP, sequência e dificuldades por aluno individual

---

## ✅ CHECKLIST DE ACEITE DO MARCO 2

1. Home mostra nome do aluno e contagem regressiva para a prova
2. Todas as métricas aparecem: Horário de Ouro, Cobertura do Edital, Lacunas, Horas Estudadas
3. O card diz "Índice de Preparação" (não "de Aprovação")
4. Gráfico de evolução não plota ponto em dia sem questões respondidas
5. Barra inferior permanece fixa ao rolar a tela
6. Menu do avatar tem os 6 itens corretos
7. Tema claro e escuro alternam corretamente
8. Níveis exibem os nomes corretos nas faixas de XP corretas
9. Acerto rende mais XP que apenas responder
10. Admin consegue editar valores de XP e pesos do algoritmo pelo painel
11. Mapa mental abre com zoom funcional
12. Filtros de Flashcards/Mapas/Videoaulas mostram todo o acervo, não só o edital
13. Importação de questões por Excel funciona
14. Assinatura no Mercado Pago completa um ciclo (assinar → cobrar → cancelar)
15. Limite diário de questões bloqueia corretamente por plano
16. Múltiplas preparações funcionam só no Premium
17. Todas as métricas do funil aparecem no painel administrativo

**➡️ AO CONCLUIR: PARE e emita o aviso 🏁 MARCO 2 CONCLUÍDO.**

---

# 🚫 FORA DO ESCOPO

**NÃO IMPLEMENTAR.** Estes itens ficaram para uma etapa futura:

- Simulados
- Página dedicada de Análise de Desempenho *(os indicadores essenciais já estão na Home — a cliente tachou o item do menu justamente porque as informações aparecem no Dashboard)*
- Treinamento Cognitivo
- Sessão NeuroCognitiva
- Mentoria
- Consultoria
- Aprovados
- Texto para Áudio

---

# 🎨 IDENTIDADE VISUAL

Tema escuro (padrão), estilo tecnológico/neon:

| Elemento | Valor |
|---|---|
| Fundo principal | `#0a0e17` |
| Fundo de cards | `#0f1826` |
| Bordas | `#1c2b40` |
| Cor de destaque (ciano) | `#22d3ee` |
| Texto principal | `#dbe4f3` |
| Texto secundário | `#8ea0bd` |

- Cards com bordas arredondadas e brilho suave (glow) no destaque
- Ícones em linha (outline), não preenchidos
- Nome da plataforma: **O Algoritmo da Aprovação**
- Saudação da Home: "Disciplina hoje. Consistência sempre. Resultados são consequência!"
- Tema claro deve espelhar a mesma estrutura com paleta invertida

---

# 📌 DECISÕES JÁ FECHADAS COM A CLIENTE

Para evitar retrabalho, estas decisões **já estão definidas** e não devem ser questionadas:

| Tema | Decisão |
|---|---|
| Peso do assunto | Vem do edital quando disponível; campo manual na confirmação quando não vier |
| Motor de revisão | **Separado** do motor da Tarefa do Dia |
| Gráfico de evolução | Dia sem questão = sem ponto (não cai) |
| Menu "Desempenho" | Removido — métricas ficam na Home |
| "Índice de Aprovação" | Renomeado para **"Índice de Preparação"** |
| Filtros de conteúdo | Acervo aberto, não restrito ao edital do aluno |
| Filtro de banca nas questões | Aberto a outras bancas além da do edital |
| Gateway de pagamento | **Mercado Pago** |
| Múltiplas preparações | Exclusivo do plano Premium |
| Propriedade | Código, banco, contas e domínio pertencem à cliente |

---

# ⚙️ CONFIGURAÇÃO DE AMBIENTE

Variáveis necessárias:

```
DATABASE_URL=              # PostgreSQL
ANTHROPIC_API_KEY=         # leitura do edital em PDF
MERCADOPAGO_ACCESS_TOKEN=  # assinaturas
NEXTAUTH_SECRET=           # sessões
SMTP_*=                    # e-mails de recuperação de senha
```

**Custos de infraestrutura correm por conta da cliente** (servidor, API de IA, hospedagem de vídeo) e são proporcionais ao uso.
