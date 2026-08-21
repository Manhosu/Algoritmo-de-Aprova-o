# Login com Google — o que precisa ser configurado

> ## ⛔ SUSPENSO em 21/08/2026
>
> A cliente decidiu **não ter login com Google no lançamento**. Palavras dela:
> *"pensando melhor acho que nesse começo é melhor não ter, para que eu possa
> garantir o contato do usuário (whatsapp)"*.
>
> O motivo é correto: o Google entrega nome, e-mail e foto — **não entrega
> telefone**. Com login social, parte dos alunos entraria sem WhatsApp, ou
> passaria por uma etapa extra de conclusão que anularia a conveniência.
>
> **O que foi desfeito:** os botões nas telas de login e cadastro.
>
> **O que ficou:** a tabela `user_identities`, as variáveis de ambiente e este
> documento. Manter custa zero, e retomar seria só religar. Desfazer a migration
> `0003` custaria mais do que vale.
>
> O passo a passo abaixo continua válido para o dia em que a decisão mudar.

---


> ## ⚠️ URL de produção reservada
>
> ```
> https://algoritmo-da-aprovacao.vercel.app
> ```
>
> Ela já foi passada à cliente para cadastrar no Google Cloud, de modo a evitar
> uma segunda ida e volta quando o deploy acontecer.
>
> **Consequência:** ao criar o projeto na Vercel, o nome precisa ser
> **exatamente** `algoritmo-da-aprovacao`. Qualquer outro nome gera outra URL, e
> aí o Google recusa o login com `redirect_uri_mismatch` até alguém reabrir o
> console e corrigir.
>
> Se o subdomínio estiver ocupado quando formos criar o projeto, a Vercel
> acrescenta um sufixo — nesse caso é preciso avisar a cliente e atualizar a URI
> autorizada.

Guia para gerar as credenciais no Google Cloud. Leva cerca de 15 minutos e não
tem custo.

**Use a conta `oalgoritmodaaprovacao@gmail.com`.** Se as credenciais forem
criadas numa conta pessoal, elas ficam presas a ela — e o projeto pertence à
cliente.

---

## Antes de começar: como isso funciona por baixo

Vale entender para as decisões abaixo fazerem sentido.

O Google **não** cuida da sessão do aluno. Ele é consultado uma única vez, no
momento do login, só para confirmar "esta pessoa é dona deste e-mail". Depois
disso a plataforma emite a **própria sessão**, com a nossa expiração e a nossa
revogação.

Isso importa por um motivo concreto: quando um aluno pede exclusão da conta, o
acesso dele cai **na hora**. Se a sessão fosse do Google, ela continuaria válida
até o token dele expirar, e a promessa de exclusão efetiva ficaria falsa.

Também **não guardamos nenhum token do Google**. Pedimos apenas escopo de
identificação (`openid`, `email`, `profile`) — nada de agenda, contatos ou
arquivos. Não há nada a acessar em nome do aluno depois do login, e credencial
guardada sem uso é só passivo em caso de vazamento.

---

## Passo 1 — Criar o projeto no Google Cloud

1. Acesse <https://console.cloud.google.com/> com a conta do projeto.
2. No topo, clique no seletor de projeto → **Novo projeto**.
3. Nome: `Algoritmo da Aprovacao`.
4. **Criar** e aguarde. Depois, selecione o projeto recém-criado no seletor.

---

## Passo 2 — Configurar a tela de consentimento

É a tela que o aluno vê quando clica em "Entrar com Google".

1. Menu lateral → **APIs e serviços** → **Tela de permissão OAuth**.
2. Tipo de usuário: **Externo** → **Criar**.

   > "Interno" só funciona para contas de uma organização Google Workspace.
   > Alunos usam Gmail comum, então tem que ser Externo.

3. Preencha:

   | Campo | Valor |
   |---|---|
   | Nome do app | `O Algoritmo da Aprovação` |
   | E-mail de suporte | `oalgoritmodaaprovacao@gmail.com` |
   | Logotipo | `public/brand/symbol-square.png` (512×512, já está no projeto) |
   | Domínio do app | `oalgoritmodaaprovacao.com.br` |
   | Link da Política de Privacidade | `https://oalgoritmodaaprovacao.com.br/politica-de-privacidade` |
   | Link dos Termos de Uso | `https://oalgoritmodaaprovacao.com.br/termos-de-uso` |
   | E-mail do desenvolvedor | `oalgoritmodaaprovacao@gmail.com` |

4. **Escopos** → **Adicionar ou remover escopos** → marque exatamente estes três:

   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`

   > **Não adicione mais nada.** Esses três são "não sensíveis" e não exigem
   > revisão do Google. Qualquer escopo além deles joga o app numa fila de
   > verificação que leva semanas — e não precisamos de nada além de saber quem
   > é a pessoa.

5. **Usuários de teste** → adicione os e-mails que vão testar antes do
   lançamento (o seu e o da cliente, no mínimo).

6. Salvar.

---

## Passo 3 — Criar as credenciais

1. Menu lateral → **APIs e serviços** → **Credenciais**.
2. **Criar credenciais** → **ID do cliente OAuth**.
3. Tipo de aplicativo: **Aplicativo da Web**.
4. Nome: `Algoritmo da Aprovacao - Web`.
5. **Origens JavaScript autorizadas** — adicione:

   ```
   http://localhost:3000
   https://algoritmo-da-aprovacao.vercel.app
   https://oalgoritmodaaprovacao.com.br
   ```

6. **URIs de redirecionamento autorizados** — adicione:

   ```
   http://localhost:3000/api/auth/google/callback
   https://algoritmo-da-aprovacao.vercel.app/api/auth/google/callback
   https://oalgoritmodaaprovacao.com.br/api/auth/google/callback
   ```

   As três coexistem de propósito. Manter a URL da Vercel é útil para testar
   sem depender do DNS, e o `localhost` é o que permite desenvolver.

   > **Deploys de preview não vão funcionar com o Google.** Cada branch gera uma
   > URL com hash (`algoritmo-da-aprovacao-git-xyz.vercel.app`) que não bate com
   > nenhuma URI cadastrada. É esperado: o login por senha continua funcionando
   > nos previews, e só a produção tem o botão do Google.

   > Estes endereços precisam bater **caractere por caractere** com o que a
   > aplicação envia. Uma barra a mais no fim e o Google recusa com
   > `redirect_uri_mismatch`. É de longe o erro mais comum aqui.

7. **Criar**. Aparecem duas informações:

   - **ID do cliente** — algo como `123456789-abc...apps.googleusercontent.com`
   - **Chave secreta do cliente** — algo como `GOCSPX-...`

8. **Copie as duas e me envie.** A chave secreta pode ser vista de novo depois,
   mas não custa guardar.

---

## Passo 4 — Publicar (só quando o domínio existir)

Enquanto o app estiver em **Testes**, só os e-mails cadastrados como usuários de
teste conseguem entrar, e a sessão do Google expira a cada 7 dias.

Para liberar a qualquer aluno:

1. **Tela de permissão OAuth** → **Publicar app** → **Confirmar**.
2. Com apenas os três escopos não sensíveis, **não há revisão do Google** — a
   publicação é imediata.

**Mas há uma dependência:** publicar exige que os links de Política de
Privacidade e Termos de Uso estejam **no ar e acessíveis**, no domínio do app.

A ordem é:

```
✅ registrar o domínio        (feito em 20/08/2026)
   ↓
   publicar a Política de Privacidade em
   https://oalgoritmodaaprovacao.com.br/politica-de-privacidade
   ↓
   publicar a tela de consentimento
   ↓
   login com Google liberado para todos
```

Até lá, o login com Google funciona normalmente em desenvolvimento e para os
usuários de teste.

---

## O que o login com Google **não** dispensa

Vale alinhar antes, para não virar surpresa na tela.

O Google entrega **nome, e-mail e foto** — e só. Ele não entrega telefone.

Como o WhatsApp é obrigatório no cadastro, e o consentimento da LGPD e a
disponibilidade de estudo também precisam ser coletados, o aluno que entra pela
primeira vez com Google vê uma etapa curta de conclusão:

| Etapa | Com Google | Com e-mail e senha |
|---|---|---|
| Nome | preenchido automaticamente | digitado |
| E-mail | preenchido e **já verificado** | digitado + e-mail de confirmação |
| Senha | não precisa | digitada |
| WhatsApp | **precisa informar** | digitado |
| Aceite da Política de Privacidade | **precisa aceitar** | aceito |
| Tempo de estudo e dias da semana | **precisa informar** | informado |

O ganho real do Google não é pular o cadastro: é **não ter senha para criar,
lembrar nem recuperar**, e ter o e-mail já verificado sem esperar mensagem
nenhuma. Isso reduz bastante o abandono no topo do funil.

---

## Duas decisões de segurança já tomadas

**Vinculação automática de conta.** Se alguém se cadastrou com senha usando
`fulano@gmail.com` e depois aparece um login Google com o mesmo endereço, as
contas só são unidas automaticamente quando o Google confirma que o e-mail é
verificado **e** a conta existente também já tem e-mail verificado. Fora disso,
pedimos a senha antes de vincular. Sem essa regra, seria possível tomar a conta
de outra pessoa a partir de um e-mail não confirmado.

**Recuperação de senha em conta só-Google.** Quem entrou apenas pelo Google não
tem senha. Se pedir recuperação, a mensagem diz que a conta usa login com Google
— em vez de enviar um e-mail que não resolve nada. A pessoa pode definir uma
senha depois, nas Configurações, se quiser os dois caminhos.
