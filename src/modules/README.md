# `src/modules` — o domínio

Aqui mora a lógica de negócio do produto: os dois motores, o cronograma, a
gamificação e as métricas.

## A regra

**Nada aqui dentro conhece Next.js, React, banco de dados ou variável de
ambiente.** Função pura: recebe dados, devolve resultado. Sem I/O, sem
`Date.now()` implícito, sem `process.env`.

Isso não é preferência estética. Os motores vão ser **calibrados várias vezes**
ao longo do projeto — os pesos mudam, a curva muda, a fórmula do índice muda. A
única forma de mexer neles com confiança é ter uma suíte que roda em
milissegundos e prova que a mudança fez o que devia fazer. Um motor que precisa
de banco de dados para ser testado é um motor que não vai ser testado.

A regra é aplicada por lint (`eslint.config.mjs`), não por combinação: importar
`drizzle-orm` ou `react` aqui quebra o build.

## Como a dependência flui

```
  src/app        (telas e rotas)
       │
       ▼
  src/server     (orquestra: lê o banco, chama o domínio, grava o resultado)
       │
       ▼
  src/modules    (decide — e não sabe que os outros dois existem)
```

A seta nunca aponta para cima. Se um módulo precisa de um dado, ele o **recebe
por parâmetro**; não vai buscá-lo.

## Tempo é parâmetro, nunca ambiente

Nenhuma função aqui chama `new Date()`. O instante atual entra como argumento.

Motivo prático: metade das regras do produto depende de "que dia é hoje" no fuso
de Brasília — Tarefa do Dia, vencimento de revisão, streak, limite diário. Um
teste que depende do relógio da máquina passa em agosto e falha na virada do
horário de verão, à meia-noite, na máquina de outra pessoa.

## Os módulos

| Pasta | O que decide |
|---|---|
| `daily-task/` | **Motor 1.** Cruza os 5 sinais e devolve a Tarefa do Dia ordenada, com a contribuição de cada sinal. |
| `review/` | **Motor 2.** Dada uma conclusão de estudo, devolve as datas das 5 revisões. Trata atraso. **Independente do Motor 1.** |
| `schedule/` | Projeta o cronograma até a prova e diz se o conteúdo restante cabe na disponibilidade informada. |
| `gamification/` | XP, nível, streak, missões (Marco 2). |
| `metrics/` | Índice de Preparação, Cobertura do Edital, Horário de Ouro, Lacunas. |
| `taxonomy/` | Normalização de texto e casamento entre o edital do aluno e o catálogo canônico. |
| `shared/` | Tipos e utilidades de domínio (datas civis, faixas, aritmética de pesos). |

## Por que os dois motores são módulos separados

Porque são decisões de natureza diferente, e misturá-las é o erro que a cliente
pediu explicitamente para evitar (README, seções 1.6 e 1.7):

- A **Tarefa do Dia** é uma decisão tomada *hoje* sobre o que vale mais a pena
  estudar hoje. Depende de desempenho, peso, urgência, recência e lacunas.
- A **Revisão** é um compromisso assumido *no passado*, com data marcada. Não
  compete por prioridade: vence no dia em que vence.

Se compartilhassem código, a revisão acabaria disputando espaço com a
priorização e sumiria em dia cheio — exatamente o que a curva do esquecimento
não pode permitir.
