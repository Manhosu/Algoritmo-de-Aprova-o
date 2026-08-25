# Formato dos flashcards

> Resposta à pergunta da cliente em 25/08/2026: *"em relação aos flashcards,
> qual o formato para subir na plataforma? Porque tem frente e verso, não estou
> sabendo como montar."*

## O modelo: baralho e cartão

O banco já tem as duas camadas, e a distinção importa para montar a planilha.

**Baralho** (`content_items`, tipo `flashcard_deck`) — é o que aparece na
listagem para o aluno e o que o Motor 1 prescreve quando escolhe a técnica
"flashcard". Um baralho pertence a **UM assunto**.

**Cartão** (`flashcards`) — frente, verso e uma dica opcional. Vive dentro de um
baralho.

Consequência prática: **um baralho por assunto**, com quantos cartões quiserem.
Não misture Crase e Concordância no mesmo baralho — o motor não saberia qual
assunto está sendo estudado, e a métrica de "melhor técnica de estudo" perderia
o vínculo entre a técnica usada e o desempenho medido.

## As colunas da planilha

Mesmo espírito da planilha de questões: uma linha por **cartão**, e as colunas
de baralho se repetem.

| Coluna | Obrigatória | O que é |
|---|---|---|
| `Disciplina` | sim | Português, Direito Administrativo… Precisa bater com o catálogo. |
| `Assunto` | sim | Crase, Concordância Verbal… É o que liga o baralho ao edital do aluno. |
| `Baralho` | sim | Título que o aluno vê. Ex.: "Crase — regras essenciais". Repete em todas as linhas do mesmo baralho. |
| `Frente` | sim | A pergunta ou o estímulo. |
| `Verso` | sim | A resposta. |
| `Dica` | não | Pista para quem travou, sem entregar a resposta. |
| `Ordem` | não | Número para forçar a sequência dos cartões. Em branco, segue a ordem da planilha. |
| `Acesso` | não | `Free` ou `Premium`. Em branco, entra como Free. |

## Como escrever frente e verso

O cartão não é um resumo cortado ao meio. Ele é **uma pergunta e uma resposta**,
e a diferença decide se o flashcard ensina ou só ocupa tempo.

**A frente faz UMA pergunta.**

> ✅ Ocorre crase antes de palavra masculina?
> ❌ Crase: conceito, regras de uso, casos proibidos e casos facultativos

A segunda não é um cartão — é um índice. Quem a lê não consegue responder nada,
então não há como o cérebro recuperar informação, que é o mecanismo inteiro da
técnica.

**O verso responde e para.**

> ✅ Não, salvo quando estiver subentendida a expressão "à moda de" — "à Machado
> de Assis".
> ❌ (três parágrafos explicando a teoria da crase)

Verso longo vira leitura passiva. Se o assunto precisa de três parágrafos, ele é
um resumo ou um mapa mental, não um flashcard.

**Um cartão, uma ideia.** Se o verso tem "e também", provavelmente são dois
cartões.

**Evite pergunta de sim ou não sem consequência.** "Crase é obrigatória antes de
'às vezes'?" é fraco. "Por que 'às vezes' leva crase?" obriga a recuperar a
regra.

## Exemplo pronto

| Disciplina | Assunto | Baralho | Frente | Verso | Dica |
|---|---|---|---|---|---|
| Português | Crase | Crase — regras essenciais | Ocorre crase antes de palavra masculina? | Não, salvo quando subentendida a expressão "à moda de": "à Machado de Assis". | Pense em "à francesa". |
| Português | Crase | Crase — regras essenciais | Ocorre crase antes de verbo? | Nunca. Verbo não admite artigo, e sem artigo não há crase. | "Começou a estudar." |
| Português | Crase | Crase — regras essenciais | Qual a diferença entre "à distância" e "a distância"? | Com crase quando a distância é determinada ("à distância de 10 metros"); sem crase quando é indeterminada. | O determinante é quem manda. |

## O que o importador vai validar

Mesma lógica do importador de questões: recusa o que produziria um cartão
inútil, e o relatório aponta a linha.

- `Frente`, `Verso`, `Disciplina`, `Assunto` e `Baralho` preenchidos
- assunto que exista no catálogo — se não existir, entra na fila de mapeamento
  em vez de ser descartado em silêncio
- frente e verso diferentes entre si
- nenhum cartão repetido dentro do mesmo baralho (frente idêntica)

## Uma nota sobre o acervo

⚠️ Enquanto **não houver material de uma técnica** para um assunto, o Motor 1
não a prescreve. O bloco vira "Estude: Crase", sem nomear técnica.

Isso é deliberado: prometer um flashcard que não existe é pior do que não
prometer nada. Mas significa que a rotação de técnicas — que é o que torna a
métrica "melhor técnica de estudo" possível — só começa a funcionar quando
houver **mais de uma técnica** disponível para o mesmo assunto.

Ou seja: flashcards de Crase sozinhos não medem nada. Flashcards **e** mapa
mental **e** resumo de Crase, sim.
