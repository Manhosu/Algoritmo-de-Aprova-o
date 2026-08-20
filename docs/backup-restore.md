# Backup e restauração do banco

> **Backup que ninguém sabe restaurar não é backup.** Este documento existe para
> ser aberto no pior dia do projeto, quando ninguém vai ter paciência de
> descobrir o comando certo.

## Como o backup funciona hoje

| Item | Valor |
|---|---|
| Onde roda | GitHub Actions — `.github/workflows/database-backup.yml` |
| Quando | Todo dia às 06:00 UTC (03:00 de Brasília) |
| O quê | `pg_dump` no formato *custom* (`-Fc`), comprimido |
| Onde fica | Artifact do próprio workflow |
| Retenção | 30 dias |
| Conexão | `DATABASE_URL_DIRECT` (porta 5432 — **não** o pooler) |

Também é possível disparar manualmente em **Actions → Backup do banco de dados →
Run workflow**. Faça isso **antes de toda migration que remove ou renomeia
coluna**.

## Configuração inicial (uma vez)

1. No GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**.
2. Nome: `DATABASE_URL_DIRECT`.
3. Valor: a connection string do Supabase em **Project Settings → Database →
   Connection string → URI**, usando a **porta 5432**.

> O pooler (porta 6543) **não serve** para `pg_dump`: ele opera em modo
> transaction e derruba o dump no meio.

## Restaurar

### 1. Baixar o dump

**Actions → Backup do banco de dados →** a execução da data desejada **→
Artifacts → `db-backup-AAAA-MM-DD_HHMM`**. Descompacte o `.zip`; dentro há um
arquivo `.dump`.

### 2. Conferir antes de restaurar

Nunca restaure um arquivo sem olhar o que tem dentro:

```bash
pg_restore --list backup-2026-08-19_0600.dump | head -40
```

Se isso falhar, o arquivo está corrompido — pegue o dia anterior.

### 3. Restaurar em um banco NOVO (o caminho seguro)

**Restaure sempre primeiro em um banco vazio**, confira, e só então decida
sobrescrever o de produção. Restaurar direto por cima é como cortar a única
corda em que se está pendurado.

```bash
# Crie um projeto/banco novo no Supabase e use a URL direta dele
createdb -h HOST -U USUARIO restauracao_teste   # ou crie pelo painel

pg_restore \
  --dbname="postgresql://USUARIO:SENHA@HOST:5432/restauracao_teste" \
  --no-owner \
  --no-acl \
  --verbose \
  backup-2026-08-19_0600.dump
```

Confira o essencial antes de seguir:

```sql
select count(*) from users;
select count(*) from preparations;
select count(*) from question_attempts;
select max(created_at) from users;   -- até quando o dado vai
```

### 4. Sobrescrever produção (último recurso)

```bash
# 1. Coloque a aplicação em manutenção (ou tire o deploy do ar).
# 2. Tire um dump do estado ATUAL, mesmo quebrado — ele pode conter
#    dado que o backup da madrugada não tem.
pg_dump "$DATABASE_URL_DIRECT" -Fc --no-owner --no-acl -f pre-restauracao.dump

# 3. Restaure limpando os objetos existentes.
pg_restore \
  --dbname="$DATABASE_URL_DIRECT" \
  --clean --if-exists \
  --no-owner --no-acl \
  --verbose \
  backup-2026-08-19_0600.dump
```

`--clean --if-exists` **apaga as tabelas atuais** antes de recriar. É por isso
que o passo 2 não é opcional.

### 5. Restaurar só uma tabela

Quando o problema foi uma importação de questões errada, por exemplo:

```bash
pg_restore \
  --dbname="$DATABASE_URL_DIRECT" \
  --table=questions \
  --data-only \
  --no-owner \
  backup-2026-08-19_0600.dump
```

## O que fazer depois de restaurar

1. Rodar `npm run db:migrate` — o dump pode ser de um schema anterior.
2. Conferir se `engine_configs` tem uma versão ativa de cada tipo. Sem isso os
   motores não geram tarefa.
3. Recalcular os rollups do período perdido (`daily_user_rollups`,
   `preparation_metrics`) — eles são derivados e não se recuperam sozinhos.
4. Encerrar sessões: `update auth_sessions set revoked_at = now() where revoked_at is null;`

## Limitações conhecidas — e o que fazer sobre elas

**Retenção de 30 dias.** É o teto de artifact do GitHub. Cobre o cenário comum
(erro descoberto em dias), não o raro (corrupção descoberta meses depois). Para
retenção longa, a saída é enviar o dump para um bucket (S3, R2, Backblaze) no
mesmo workflow — decisão que depende da cliente contratar o armazenamento.

**Não é point-in-time.** Restaurar significa voltar até 24 horas. O PITR do
Supabase resolve isso, mas é recurso de plano pago; hoje o projeto está no plano
gratuito por decisão do Eduardo. **Se a base crescer a ponto de perder um dia
ser inaceitável, o plano pago do Supabase passa a ser a resposta certa, não este
workflow.**

**O artifact fica no GitHub.** O dump contém dado pessoal de alunos. Quem tem
acesso ao repositório tem acesso ao dado — mantenha o repositório privado e a
lista de colaboradores curta.

## Testar a restauração

Uma vez por mês, restaure o backup mais recente em um banco descartável e rode
as consultas do passo 3. Backup nunca testado tem uma taxa de sucesso
historicamente pior do que a esperada, e o momento de descobrir isso não é o
momento do desastre.
