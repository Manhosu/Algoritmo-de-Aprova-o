# Subir o ambiente do zero

Do clone até a aplicação rodando com dados.

> ## O banco de produção já existe
>
> Projeto Supabase `algoritmo-da-aprovacao` (ref `zzcvkhncelwwtuzxsciz`), região
> `sa-east-1`, PostgreSQL 17.6, com migrations e seed aplicados.
>
> As connection strings estão no `.env.local` de quem já tem o ambiente montado.
> Se você está começando agora, **peça as duas URLs ao Eduardo** — a senha do
> banco não é recuperável pelo painel do Supabase, só redefinível.
>
> Com elas, pule a seção do Docker: `npm install`, preencha o `.env.local` e
> `npm run dev`.
>
> Para conferir se o banco responde: `npm run db:ping`
> Para ver o que tem dentro: `npm run db:status`
>
> O Docker abaixo continua sendo a opção para desenvolver contra um banco
> descartável, sem risco de mexer no dado real.

## Pré-requisitos

| Ferramenta | Versão | Por quê |
|---|---|---|
| Node.js | 20.9+ (recomendado 22 ou 24) | Exigência do Next.js 16 |
| Git | qualquer | — |
| **Docker Desktop** | qualquer recente | Banco de desenvolvimento — **ainda não instalado nesta máquina** |

> **Sem Docker?** Você ainda consegue rodar `npm run dev`, `npm run test`,
> `npm run lint`, `npm run typecheck` e **`npm run db:verify`** — este último
> aplica todas as migrations e roda o seed inteiro num Postgres efêmero
> (WebAssembly), sem instalar nada. O que exige Docker é ter um banco de verdade,
> persistente, para a aplicação conversar.
>
> Instalar: <https://www.docker.com/products/docker-desktop/>

## Passo a passo

### 1. Dependências

```bash
npm install
```

Se o npm pedir aprovação de scripts de instalação (npm 11+), aprove os que ele
listar — são `esbuild` e `unrs-resolver`, usados por Vitest e ESLint:

```bash
npm approve-scripts --allow-scripts-pending
```

### 2. Banco local

```bash
docker compose up -d --wait
```

O `--wait` só devolve o terminal quando o Postgres aceita conexão. Sem ele, o
comando de migration logo em seguida falha porque o banco ainda está subindo.

Sobe um Postgres 17 em **localhost:5433** (5433 e não 5432, para não conflitar
com um Postgres já instalado na máquina).

### 3. Variáveis de ambiente

```bash
cp .env.example .env.local
```

Para desenvolvimento local, o mínimo é:

```dotenv
DATABASE_URL="postgresql://algoritmo:algoritmo@localhost:5433/algoritmo_aprovacao"
DATABASE_URL_DIRECT="postgresql://algoritmo:algoritmo@localhost:5433/algoritmo_aprovacao"

AUTH_SECRET="<cole aqui 32+ caracteres aleatórios>"
ANONYMIZATION_PEPPER="<cole aqui outros 32+ caracteres aleatórios>"

APP_URL="http://localhost:3000"
```

Gerar os dois segredos:

```bash
# Linux / macOS / Git Bash
openssl rand -base64 32

# PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
```

`ANTHROPIC_API_KEY` e `RESEND_API_KEY` ficam vazias por enquanto: sem elas a
leitura de edital não roda e os e-mails são impressos no console em vez de
enviados. O resto da aplicação funciona.

### 4. Criar as tabelas e popular

```bash
npm run db:migrate
npm run db:seed
```

O seed cria os 3 planos, os 5 níveis, a versão 1 das configurações dos motores
(pesos e XP exatamente como no README), as bancas, o catálogo canônico inicial e
as questões de exemplo.

### 5. Rodar

```bash
npm run dev
```

http://localhost:3000

## Comandos do dia a dia

```bash
npm run dev            # servidor de desenvolvimento
npm run typecheck      # TypeScript
npm run lint           # ESLint
npm run test           # Vitest — testes dos motores
npm run test:watch     # Vitest em watch

npm run db:generate    # gera migration a partir do schema
npm run db:verify      # aplica migrations + seed num Postgres efêmero (não precisa de Docker)
npm run db:migrate     # aplica migrations pendentes no banco configurado
npm run db:studio      # navegador visual do banco
npm run db:seed        # popula os dados iniciais
```

### `db:verify` — o que ele checa

Roda sem banco e sem Docker. Aplica todas as migrations num Postgres compilado
para WebAssembly e depois confere:

- que cada comando SQL realmente aplica (gatilhos e constraints inclusive);
- as invariantes que o projeto promete — motores sem tabela em comum, uma
  assinatura ativa por usuário, funil chaveado pela pseudônima, e outras;
- que o banco **recusa** o que deve recusar: conta anonimizada com dado pessoal,
  conta ativa sem WhatsApp, e-mail com maiúscula, configuração travada sendo
  alterada ou apagada;
- que o seed roda de ponta a ponta e é idempotente.

Vale rodar antes de qualquer migration tocar o banco da cliente.

## Zerar o banco

```bash
docker compose down -v      # ⚠️ apaga o volume e todos os dados
docker compose up -d --wait
npm run db:migrate
npm run db:seed
```

## Apontar para o Supabase da cliente

Quando o projeto dela existir, é só trocar duas variáveis no `.env.local` — nada
no código muda:

```dotenv
# Pooler (porta 6543) para a aplicação
DATABASE_URL="postgresql://postgres.PROJETO:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"

# Conexão direta (porta 5432) para migrations e backup
DATABASE_URL_DIRECT="postgresql://postgres.PROJETO:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
```

Depois:

```bash
npm run db:migrate
npm run db:seed
```

As mesmas migrations rodam nos dois bancos — é o mesmo Postgres. A única
diferença que importa é o pooler: migrations e backup **precisam** da conexão
direta, porque o pooler em modo transaction não sustenta DDL.

## Problemas comuns

**`ECONNREFUSED ::1:5433`** — o Docker não está rodando, ou o container ainda
está subindo. Cheque com `docker compose ps` e use `--wait`.

**`Variáveis de ambiente inválidas ou ausentes`** — o `.env.local` não existe ou
falta uma variável obrigatória. A mensagem de erro lista exatamente quais.

**A porta 5433 já está em uso** — mude o mapeamento no `docker-compose.yml`
(`"5434:5432"`) e ajuste a porta nas duas URLs do `.env.local`.

**`next dev` reclama de lockfile** — outra instância de `next dev` está rodando.
O Next.js 16 impede duas na mesma pasta. Feche a outra.
