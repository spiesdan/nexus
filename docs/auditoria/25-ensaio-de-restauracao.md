# F-32 — ensaio de restauração ponta a ponta (e o defeito que ele achou)

> Executado em 17/11/2026, com evidência bruta em
> [`evidencias/restore/ensaio-20261117-195023.txt`](evidencias/restore/ensaio-20261117-195023.txt).
> Script: `scripts/auditoria/ensaio-de-restore.sh` (descartável; nenhum banco real
> é tocado).

## 1. O que foi exercitado

Container efêmero `pgvector/pgvector:pg15` (PostgreSQL 15.19), porta alocada pelo
daemon. O ciclo, na ordem:

1. **instalar** — preâmbulo + `baseline.sql` com `ON_ERROR_STOP=1` → **179
   tabelas, 179 com RLS**;
2. **semear** — 2 organizações, contatos, conversas, mensagens, pedidos e
   recebíveis (2 linhas em cada);
3. **backup** — `pg_dump` de dentro do container, `--no-owner`, pipe + `gzip`
   (mesmo caminho do `backup.sh`); 154 KB, sha256 registrado;
4. **apagar** — `drop database` da origem (verificado: não existe mais);
5. **restaurar** — `gunzip | psql` num banco criado do zero, exit 0;
6. **conferir** — linhas por tabela, contagem de tabelas/RLS, privilégio do role
   do app e **isolamento cross-tenant com JWT simulado** (admin de A lê 0 de B e
   ≥1 da própria).

**Resultado: PASSOU** — 179/179 tabelas com RLS depois do restore; 2 linhas por
tabela semeada; `authenticated` pode ler `contacts`; isolamento preservado.

## 2. O defeito que o ensaio achou (e que nenhuma leitura de código acharia)

A primeira rodada usou `pg_dump --no-owner --no-privileges` — exatamente o que o
`backup.sh` fazia. O restore "teve sucesso", as linhas voltaram, o RLS estava
ligado… e a consulta como `authenticated` respondeu:

```
ERROR:  permission denied for table messages
```

**O dump não carrega nenhum GRANT.** `--no-privileges` remove as concessões
(`authenticated`/`anon`/`service_role`) e o `ALTER DEFAULT PRIVILEGES` do
baseline. Consequência real: num restore, o banco volta com os dados e **sem o
acesso do app** — o pior momento possível para descobrir, e o sintoma ("500 em
tudo") não aponta para privilégio.

### Correção

| Arquivo | Mudança |
|---|---|
| `hostgator-setup-kit/_common.sh` (`pg_dump_run`) | `--no-owner` **sem** `--no-privileges`: o dump passa a ser um backup do banco **em funcionamento** |
| `hostgator-setup-kit/restore.sh` | depois do restore, verifica `has_table_privilege('authenticated','public.contacts','SELECT')`; se falso (backup **antigo**), re-aplica o `baseline.sql` — idempotente e já usado em toda atualização — e verifica de novo; se continuar sem acesso, **falha alto** em vez de deixar subir o app quebrado |

`--no-owner` continua: o dono dos objetos passa a ser quem restaura, que é o
correto quando a instalação é recriada. Privilégio não é dono.

## 3. Lacunas que continuam abertas (declaradas, com causa)

| Lacuna | Por que não foi fechada nesta fatia |
|---|---|
| **uploads/storage não entram no backup** | O `backup.sh` cobre banco + volume `waha-data`. Avatares, fotos de produto e mídia de conversa vivem no storage do Supabase (volume próprio em self-host, bucket em Cloud) — incluir exige decidir **qual** caminho é a fonte por tipo de instalação (volume do compose × bucket × bind de `product-images`) e como restaurar sem sobrescrever mídia mais nova. É decisão de operação, não de código de uma linha |
| **rotação do storage** | O banco mantém 14 por tipo; storage não tem política. Depende da mesma decisão acima |
| **health da aplicação durante o restore** | `/api/v1/health` exige o app no ar; este ensaio mede saúde do **banco**. O kit tem `healthcheck.sh` (de dentro da rede) para o app, e o restore já manda reiniciar — mas a sequência restore→health com app real não foi exercitada aqui |
| **restore parcial / PITR** | Não existe WAL archiving no kit; o backup é lógico. PITR é decisão de infraestrutura |

Essas lacunas estão registradas no `[!]` do item 6.9 e no `[~]` do 9.8 — não
viram `[x]` por este ensaio.

## 4. Reprodução

```console
$ bash scripts/auditoria/ensaio-de-restore.sh
...
PASSOU — backup, perda e restauração preservaram linhas, RLS e isolamento.
```

O script sai diferente de zero em qualquer divergência (linha vazia, tabela a
menos, RLS desligado, privilégio perdido, vazamento entre tenants). A evidência
de cada rodada é gravada em `docs/auditoria/evidencias/restore/`.
