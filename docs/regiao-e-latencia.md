# Região do servidor e latência do banco

## O problema

Responder uma questão levava **5 segundos** em produção. A mesma página, só
carregada, levava 250 ms. Como o render é rápido e a ação é lenta, e as duas
usam o mesmo banco, a diferença tinha que estar no número de idas ao banco —
não no tamanho de cada uma.

`/api/health` mede de dentro do servidor e respondeu:

```json
{ "mediaPorIdaMs": 115, "regiao": "iad1" }
```

**`iad1` é Washington. O banco está em `sa-east-1`, São Paulo.**

Cada consulta atravessava o continente ida e volta: 115 ms. `answerQuestion`
faz cerca de 40 idas em série (gravar a tentativa, mover o domínio do assunto,
creditar XP, recalcular a sequência, lançar moeda, atualizar o consumo do dia,
atualizar a estatística da questão, mais o funil e as conquistas).

40 × 115 ms ≈ 4,6 segundos. Bate com o medido.

## A correção

`vercel.json`:

```json
{ "regions": ["gru1"] }
```

`gru1` é São Paulo, a mesma região do banco. A ida cai de 115 ms para poucos
milissegundos, e o mesmo caminho passa a custar centenas de milissegundos.

⚠️ **Isto vale para toda a aplicação, não só para responder questão.** Toda
página que lê o banco pagava a travessia. Foi a mudança de maior efeito por
linha de código do projeto inteiro.

## Como conferir depois de qualquer deploy

```
curl -s https://oalgoritmodaaprovacao.com.br/api/health
```

O campo `regiao` precisa dizer `gru1` e `mediaPorIdaMs` precisa ficar abaixo de
20. Se `regiao` voltar a ser `iad1`, alguém removeu o `vercel.json` ou a
configuração de região foi sobrescrita no painel da Vercel — o painel vence o
arquivo.

## O que NÃO era

Duas hipóteses medidas e descartadas antes de chegar aqui, para não serem
investigadas de novo:

- **Pooler errado.** `DATABASE_URL` usa a porta 5432 (modo sessão). Medindo da
  minha máquina, sessão e transação dão os mesmos 21 ms por ida. O modo não era
  o problema — a distância era.
- **Render da página.** Um GET de `/questoes` custa 215–274 ms em produção,
  incluindo a rede até o navegador. A ação custava 5.000 ms. Não é o render.

## Um efeito colateral que ficou

`max: 3` no pool com o pooler em modo sessão tem teto baixo de clientes. Uma
sonda que pediu dez consultas em paralelo derrubou o banco com
`EMAXCONNSESSION: max clients reached in session mode`. Com a aplicação perto do
banco cada função segura conexão por muito menos tempo, o que alivia o teto —
mas se um dia o produto tiver muitos alunos simultâneos, o caminho é o pooler em
modo transação (porta 6543), que foi testado e funciona com este código
(`prepare: false` já está ligado).
