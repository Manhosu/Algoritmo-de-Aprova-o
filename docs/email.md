# E-mail transacional

A plataforma envia trÃªs e-mails, todos do Marco 1:

- recuperaÃ§Ã£o de senha
- confirmaÃ§Ã£o de e-mail no cadastro
- confirmaÃ§Ã£o de troca de e-mail (enviada ao endereÃ§o **novo**)

Provedor: **Resend**, regiÃ£o `sa-east-1` (SÃ£o Paulo).

---

## Estado atual

| | |
|---|---|
| DomÃ­nio | `oalgoritmodaaprovacao.com.br` |
| Cadastrado no Resend | âœ… em 20/08/2026 |
| Id no Resend | `4f4a7b0f-5a4b-4039-a29c-82451d92dc63` |
| Verificado | âŒ **aguardando os registros DNS** |
| Remetente final | `nao-responda@oalgoritmodaaprovacao.com.br` |

**Enquanto nÃ£o verificar**, o Ãºnico remetente que funciona Ã©
`onboarding@resend.dev`, e ele **sÃ³ entrega para o e-mail dono da conta
Resend** (`oalgoritmodaaprovacao@gmail.com`). DÃ¡ para testar o fluxo inteiro,
mas sÃ³ para esse endereÃ§o â€” o item 12 do checklist de aceite depende da
verificaÃ§Ã£o para valer para qualquer aluno.

---

## Os 3 registros DNS

Precisam ser adicionados no painel onde o domÃ­nio foi registrado.

### 1. Assinatura DKIM

```
Tipo:  TXT
Nome:  resend._domainkey
Valor: p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDXTSelbpDLTmY4Q8cw7mg5h0nBD0AA3WiSJvC2ssu6rZeCCZZg3VpXzkLGPfjBX5xwARoZhNqrOBMijuS5mHIAXjenivWvgpGO5+FJEtAN0r+yFctvDnupmQ8ZHnsJHwIRyBh9q8FcNc7ozjh3PsmOSjsoDYghma+0iM9DS5QzvwIDAQAB
TTL:   automÃ¡tico
```

### 2. Retorno de erros (bounce)

```
Tipo:       MX
Nome:       send
Valor:      feedback-smtp.sa-east-1.amazonses.com
Prioridade: 10
TTL:        automÃ¡tico
```

### 3. AutorizaÃ§Ã£o de envio (SPF)

```
Tipo:  TXT
Nome:  send
Valor: v=spf1 include:amazonses.com ~all
TTL:   automÃ¡tico
```

### Cuidados ao cadastrar

**O campo "Nome" Ã© relativo ao domÃ­nio.** Se o painel pedir o nome completo,
use `resend._domainkey.oalgoritmodaaprovacao.com.br` e
`send.oalgoritmodaaprovacao.com.br`. Se o painel jÃ¡ completa sozinho, use sÃ³
`resend._domainkey` e `send` â€” digitar o domÃ­nio duas vezes Ã© o erro mais
comum e resulta em `send.oalgoritmodaaprovacao.com.br.oalgoritmodaaprovacao.com.br`.

**O valor do DKIM Ã© uma linha sÃ³.** Alguns painÃ©is quebram em vÃ¡rias linhas ao
colar. Confira se nÃ£o entrou espaÃ§o nem quebra no meio.

**NÃ£o confunda o MX de `send` com o MX do domÃ­nio principal.** Este Ã© do
subdomÃ­nio `send`; ele nÃ£o interfere no e-mail normal do domÃ­nio.

---

## Verificar

Depois de adicionar os trÃªs, a propagaÃ§Ã£o leva de alguns minutos a algumas
horas. Para conferir:

```bash
npm run email:check
```

Ou no painel: <https://resend.com/domains> â†’ o domÃ­nio â†’ **Verify DNS Records**.

---

## Por que trÃªs registros, e nÃ£o um

Cada um resolve um problema diferente de entrega. Sem eles, o e-mail de
recuperaÃ§Ã£o de senha vai direto para spam â€” ou nem sai.

**DKIM** assina cada mensagem criptograficamente. Ã‰ o que prova ao Gmail que a
mensagem veio mesmo de quem diz ter vindo, e nÃ£o de alguÃ©m falsificando o
domÃ­nio.

**SPF** declara quais servidores podem enviar em nome do domÃ­nio. Sem ele,
qualquer um pode mandar e-mail se passando por `@oalgoritmodaaprovacao.com.br`.

**MX de bounce** recebe de volta os avisos de entrega falhada. Sem ele, um
e-mail que nÃ£o chega simplesmente some, e ninguÃ©m descobre que o aluno nunca
recebeu o link de recuperaÃ§Ã£o â€” a falha mais silenciosa e mais irritante que
existe nesse fluxo.

---

## Em desenvolvimento

Sem `RESEND_API_KEY` no `.env.local`, o adaptador de e-mail usa o **driver de
log**: a mensagem inteira Ã© impressa no console em vez de enviada.

Ã‰ proposital. Rodar o fluxo de recuperaÃ§Ã£o de senha vinte vezes durante o
desenvolvimento nÃ£o deve consumir cota nem encher a caixa de ninguÃ©m â€” e ver o
link direto no terminal Ã© mais rÃ¡pido que abrir o e-mail.
