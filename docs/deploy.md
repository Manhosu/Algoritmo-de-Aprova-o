# Publicação — Vercel, GitHub e domínio

> Estado em 25/08/2026.

## O que já está feito

| | |
|---|---|
| Repositório | `Manhosu/Algoritmo-de-Aprova-o` — **privado** |
| Projeto na Vercel | `algoritmo-da-aprovacao` (time `o-algoritmo-da-aprovacao`) |
| Variáveis de ambiente | as 10, em produção, preview e desenvolvimento |
| Domínios no projeto | `oalgoritmodaaprovacao.com.br` e `www.` |
| DNS do e-mail | SPF, MX e DKIM do Resend no ar e conferidos |

## ⚠️ O nome do projeto na Vercel é obrigatório

`algoritmo-da-aprovacao`, exatamente assim. A URL derivada dele está cadastrada
no Google Cloud como URI de redirecionamento do login social. O login com Google
está suspenso hoje (a cliente preferiu garantir o WhatsApp de todo mundo), mas
se voltar e o nome for outro, quebra com `redirect_uri_mismatch`.

## Falta 1 — conectar o GitHub à Vercel

A conta da Vercel não tem conexão com o GitHub, e isso **não dá para fazer por
API** — é um passo de interface, uma vez só.

1. Entrar na Vercel com `oalgoritmodaaprovacao@gmail.com`
2. **Settings → Login Connections → Connect GitHub** (ou aceitar a autorização
   quando ela aparecer)
3. Abrir o projeto `algoritmo-da-aprovacao` → **Settings → Git → Connect Git
   Repository** → escolher `Manhosu/Algoritmo-de-Aprova-o`

⚠️ Conectar ao projeto que JÁ EXISTE. Importar o repositório pelo botão "Add
New → Project" criaria um segundo projeto com outro nome, e aí a URL do Google
não bate.

Feito isso, todo push na `main` vira publicação.

## Falta 2 — os dois registros de DNS

O domínio está no **Registro.br**, usando os servidores DNS do próprio
Registro.br (`f.sec.dns.br`, `e.sec.dns.br`).

**Não troque os nameservers.** Os registros do Resend vivem nessa zona; apontar
o domínio para a Vercel derrubaria o e-mail até que fossem recriados lá.

Em `registro.br → painel → seu domínio → Configurar zona DNS`, acrescentar:

| Tipo | Nome | Dados |
|---|---|---|
| `A` | `oalgoritmodaaprovacao.com.br` | `216.198.79.1` |
| `A` | `oalgoritmodaaprovacao.com.br` | `64.29.17.1` |
| `CNAME` | `www.oalgoritmodaaprovacao.com.br` | `2f5a066b15b3d54d.vercel-dns-017.com` |

Os dois `A` no apex são o par recomendado pela Vercel — os dois entram, cada um
em sua linha.

⚠️ O painel do Registro.br não aceita `@` nem `*`. O nome do apex é o domínio
escrito por extenso, como na tabela.

Os valores acima vieram da própria API da Vercel para este projeto. Se um dia
precisar reconferir:

```
curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v6/domains/oalgoritmodaaprovacao.com.br/config?teamId=$TEAM"
```

## Falta 3 — créditos da Anthropic

Sem eles a aplicação sobe e funciona; só a leitura automática de edital falha.
E falha bem: o aluno vê "a leitura automática está temporariamente
indisponível, seu edital foi guardado", e o detalhe técnico fica no log do
servidor. Ver a nota em `describeApiError`.

## Sobre a variável que não pode mudar

`ANONYMIZATION_PEPPER` foi cadastrada com o MESMO valor do desenvolvimento.

⚠️ **Nunca troque depois que o primeiro aluno se cadastrar.** É o segredo que
transforma o id de cada pessoa numa chave pseudônima estável; se ele mudar, a
mesma pessoa passa a contar como duas no funil histórico e não há como
reconstruir. Ver a nota em `src/config/env.ts`.

## Por que o build recusa subir incompleto

`src/config/env.ts` exige, em produção: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`,
`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. Faltando qualquer uma, o build
falha na hora com a lista.

É deliberado. Sem as duas do Supabase, o upload de edital "funcionaria" e o PDF
sumiria na invocação seguinte — falha silenciosa, que é a pior espécie.
