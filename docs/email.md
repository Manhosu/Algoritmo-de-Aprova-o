# E-mail transacional

A plataforma envia três e-mails, todos do Marco 1:

- recuperação de senha
- confirmação de e-mail no cadastro
- confirmação de troca de e-mail (enviada ao endereço **novo**)

Provedor: **Resend**, região `sa-east-1` (São Paulo).

---

## Estado atual

| | |
|---|---|
| Domínio | `oalgoritmodaaprovacao.com.br` |
| Cadastrado no Resend | ✅ em 20/08/2026 |
| Id no Resend | `4f4a7b0f-5a4b-4039-a29c-82451d92dc63` |
| Verificado | ❌ **aguardando os registros DNS** |
| Remetente final | `nao-responda@oalgoritmodaaprovacao.com.br` |

**Enquanto não verificar**, o único remetente que funciona é
`onboarding@resend.dev`, e ele **só entrega para o e-mail dono da conta
Resend** (`oalgoritmodaaprovacao@gmail.com`). Dá para testar o fluxo inteiro,
mas só para esse endereço — o item 12 do checklist de aceite depende da
verificação para valer para qualquer aluno.

---

## Os 3 registros DNS

Precisam ser adicionados no painel onde o domínio foi registrado.

### 1. Assinatura DKIM

```
Tipo:  TXT
Nome:  resend._domainkey
Valor: p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDXTSelbpDLTmY4Q8cw7mg5h0nBD0AA3WiSJvC2ssu6rZeCCZZg3VpXzkLGPfjBX5xwARoZhNqrOBMijuS5mHIAXjenivWvgpGO5+FJEtAN0r+yFctvDnupmQ8ZHnsJHwIRyBh9q8FcNc7ozjh3PsmOSjsoDYghma+0iM9DS5QzvwIDAQAB
TTL:   automático
```

### 2. Retorno de erros (bounce)

```
Tipo:       MX
Nome:       send
Valor:      feedback-smtp.sa-east-1.amazonses.com
Prioridade: 10
TTL:        automático
```

### 3. Autorização de envio (SPF)

```
Tipo:  TXT
Nome:  send
Valor: v=spf1 include:amazonses.com ~all
TTL:   automático
```

### Cuidados ao cadastrar

**O campo "Nome" é relativo ao domínio.** Se o painel pedir o nome completo,
use `resend._domainkey.oalgoritmodaaprovacao.com.br` e
`send.oalgoritmodaaprovacao.com.br`. Se o painel já completa sozinho, use só
`resend._domainkey` e `send` — digitar o domínio duas vezes é o erro mais
comum e resulta em `send.oalgoritmodaaprovacao.com.br.oalgoritmodaaprovacao.com.br`.

**O valor do DKIM é uma linha só.** Alguns painéis quebram em várias linhas ao
colar. Confira se não entrou espaço nem quebra no meio.

**Não confunda o MX de `send` com o MX do domínio principal.** Este é do
subdomínio `send`; ele não interfere no e-mail normal do domínio.

---

## Verificar

Depois de adicionar os três, a propagação leva de alguns minutos a algumas
horas. Para conferir:

```bash
npm run email:check
```

Ou no painel: <https://resend.com/domains> → o domínio → **Verify DNS Records**.

---

## Por que três registros, e não um

Cada um resolve um problema diferente de entrega. Sem eles, o e-mail de
recuperação de senha vai direto para spam — ou nem sai.

**DKIM** assina cada mensagem criptograficamente. É o que prova ao Gmail que a
mensagem veio mesmo de quem diz ter vindo, e não de alguém falsificando o
domínio.

**SPF** declara quais servidores podem enviar em nome do domínio. Sem ele,
qualquer um pode mandar e-mail se passando por `@oalgoritmodaaprovacao.com.br`.

**MX de bounce** recebe de volta os avisos de entrega falhada. Sem ele, um
e-mail que não chega simplesmente some, e ninguém descobre que o aluno nunca
recebeu o link de recuperação — a falha mais silenciosa e mais irritante que
existe nesse fluxo.

---

## Em desenvolvimento

Sem `RESEND_API_KEY` no `.env.local`, o adaptador de e-mail usa o **driver de
log**: a mensagem inteira é impressa no console em vez de enviada.

É proposital. Rodar o fluxo de recuperação de senha vinte vezes durante o
desenvolvimento não deve consumir cota nem encher a caixa de ninguém — e ver o
link direto no terminal é mais rápido que abrir o e-mail.
