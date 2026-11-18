# `supabase/migrations/` — HISTÓRICO MORTO. Não aplique esta pasta.

> **Decisão do dono, 18/11/2026 (F-09 = B).** Esta cadeia **não reproduz o schema**
> e **não é caminho de instalação**. O schema oficial é
> [`supabase/baseline.sql`](../baseline.sql).

## O que foi medido (16/11/2026)

| Medida | Resultado |
|---|---|
| Migrations que aplicam do zero | **35 de 292** |
| Migrations que falham | **257**, todas por pré-requisito ausente |
| Migrations com SQL inválido | **0** |
| Arquivos que são `SELECT 1;` | **10** (0001–0009 e 0013) |
| Objetos ausentes que derrubam a cadeia | **71** |

A causa raiz é histórica: as dez fundações foram aplicadas direto no projeto
Supabase original e nunca voltaram como SQL. A cadeia é **registro do que
aconteceu**, não um instalador. Detalhe completo em
[`docs/auditoria/12-migrations-e-rls.md`](../../docs/auditoria/12-migrations-e-rls.md)
e a decisão em
[`docs/auditoria/20-f09-estrategia.md`](../../docs/auditoria/20-f09-estrategia.md).

## O caminho proibido

```bash
supabase db push        # ❌ PROIBIDO
supabase migration up   # ❌ PROIBIDO
supabase db reset       # ❌ PROIBIDO
```

`db push` **passa sem erro** e marca as 257 migrations como aplicadas sobre um
schema parcial. O banco fica parecendo instalado, o app responde 500 na primeira
tela que toca a coluna nova, e a mensagem não aponta para o schema.

## O caminho correto

| Situação | Comando |
|---|---|
| Instalação nova (self-host) | `bash hostgator-setup-kit/install.sh` |
| Atualização de instalação existente | `bash hostgator-setup-kit/update.sh` (faz backup antes) |
| Deploy de imagem | `scripts/deploy.sh` (aplica o baseline e **verifica** antes do `up -d`) |
| Desenvolvimento local | `pnpm db:migrate` (aplica o `baseline.sql` e verifica) |
| Recriar do zero | `pnpm db:reset` (recria pelo baseline, não pela cadeia) |
| Só conferir | `pnpm db:verificar` |

## Ao criar schema novo

1. escreva a migration em `supabase/migrations/` (registro e revisão);
2. **acrescente o mesmo DDL, idempotente, ao apêndice do `baseline.sql`** — é o
   arquivo que chega a quem instalou;
3. registre a linha em [`MANIFEST.md`](MANIFEST.md);
4. rode `pnpm test:db` (install + update sobre dados).

A catraca em `tests/unit/cadeia-de-migrations-nao-e-instalacao.test.ts` reprova:
stub novo, script que aplique a cadeia, kit que leia esta pasta e documentação
que deixe de avisar.
