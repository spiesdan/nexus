# SECURITY DEFINER — propriedades, `pg_temp` e o caminho do worker

> Medido em 18/11/2026, em Postgres 15 descartável com o `baseline.sql`
> aplicado. Evidência: execução do invariante
> `tests/invariants/hardening-definer-propriedades.test.ts` (9 casos) e
> `scripts/test-db.sh` (install **e** update com o apêndice novo).

## 1. O que já existia, e o que faltava

| Arquivo | Pergunta que responde |
|---|---|
| `hardening-definer-varredura.test.ts` | **quem** executa (anon, authenticated volátil) e se a exceção ainda existe |
| `definer-valida-membership.test.ts` | a função **confere a organização** de quem chamou (por comportamento, nas críticas) |
| `definer-nova-nasce-exposta.test.ts` | o banco descartável é fiel ao bootstrap do Supabase (definer nova nasce exposta) |

Faltava a propriedade que uma definer **nova** não ganha sozinha: **`search_path`
fixo E fora do alcance do schema temporário**.

## 2. O furo medido

O Postgres procura o schema TEMPORÁRIO **primeiro** quando `pg_temp` não está
listado no `search_path` (documentação de `search_path`, e vale para relação e
tipo). Uma `security definer` roda com o dono (`postgres`); se o corpo referencia
`user_organizations` sem qualificar schema, quem chama cria
`pg_temp.user_organizations` e a definer lê o objeto **do chamador** com
privilégio de dono.

Medido antes da correção:

| Medida | Valor |
|---|---|
| `security definer` em `public` | 62 |
| com `search_path` fixo | 62 |
| **com `pg_temp` explícito** | **20** |
| **sem `pg_temp` (vulneráveis à sombra temporária)** | **42** |
| com grant a `PUBLIC` (`=X/` no ACL) | 0 |
| executáveis por `anon` | 0 |

## 3. A correção

Migration **0320** (`20261123130000_0320_search_path_dos_definer.sql`) +
apêndice idempotente no fim do `baseline.sql`: um bloco dirigido pelo catálogo
que **acrescenta** `pg_temp` ao fim do caminho que cada definer já tinha.

- Quem estava em `search_path=public` vira `public, pg_temp`.
- Quem já listava `private`/`extensions` mantém a ordem (`…, pg_temp`).
- Nenhuma assinatura, corpo, grant ou policy foi tocado.
- Idempotente: só age em quem ainda não lista `pg_temp`; medido aplicando duas
  vezes no mesmo banco (0 funções na segunda passada).

## 4. O invariante novo (allowlist que só encolhe)

`tests/invariants/hardening-definer-propriedades.test.ts` mede, para **toda**
definer de `public`:

1. `search_path` fixo **com `pg_temp`** (reprova a função nova que nascer sem);
2. nenhum grant de EXECUTE a `PUBLIC` (o ACL cru — `has_function_privilege` não
   distingue "grant a anon" de "grant a PUBLIC herdado");
3. nenhuma executável por `anon`;
4. definer que **recebe organização** e roda para `authenticated` guarda a
   organização no corpo (`auth.uid()` / `fn_user_org_ids` / `fn_role_at_least` /
   `fn_is_platform_admin`) **ou** delega a quem guarda (`GUARDA_DELEGADA`, com a
   função-alvo nomeada — hoje só `fn_log_event`, que chama `emit_event`);
5. definer que **só `service_role` executa** e recebe organização está em
   `CONFIA_NO_CHAMADOR` **com o call site medido** (18 entradas) — não há
   `auth.uid()` para comparar, então a decisão de confiar no chamador precisa
   estar escrita;
6. as duas listas só encolhem: entrada de função inexistente, que ganhou
   `authenticated` ou que perdeu o parâmetro reprova;
7. **caminho do worker**: toda chamada `.rpc("fn_…")` literal em `workers/`,
   `lib/` e `app/` resolve contra o catálogo e tem EXECUTE para o papel do
   client que chama (`admin` → `service_role`, resto → `authenticated`). Uma RPC
   com nome errado ou grant removido "por limpeza" quebra o worker às 3h sem
   quebrar nenhum teste de rota.

## 5. O que o gate achou de verdade

1. **42 definers** sem `pg_temp` — corrigidas pela 0320.
2. `lib/lgpd/sla-alarm.ts` chamava `.rpc("jsonb_set_last_alarm_at")`, função que
   **nunca existiu** em `public`: o caminho era "chama, recebe erro, faz o
   update" — o erro era garantido e o update sempre rodava. Removida a chamada
   morta; o update (com filtro de organização explícito) ficou.
3. `app/api/v1/admin/dashboard/kpis/route.ts` **mencionava** uma RPC inexistente
   num comentário que explica por que ela saiu; o scanner passou a ignorar linha
   de comentário em vez de exigir exceção.

## 6. Limites declarados

- **`service_role` não valida organização dentro da função** — não há `auth.uid()`.
  O que existe é a lista de confiança com o caller medido. Um bug no caller
  continua sendo bug do caller; o gate impede que isso passe sem decisão escrita.
- **Parâmetro "de organização"** é reconhecido por nome/assinatura
  (`p_org`, `p_org_id`, `p_organization_id`, `organization_id`). Função nova com
  nome fora do padrão não é reconhecida como tenant-aware — o gate não adivinha
  semântica.
- **Corpo textual**: a guarda é detectada por símbolo (`auth.uid()`, helpers de
  membership). Uma função que valide por SQL cru (`exists (select 1 from
  user_organizations where …)`) seria falso-negativo; nenhuma das 62 hoje é
  assim (as 18 que não citam símbolo estão em `CONFIA_NO_CHAMADOR`).
- **`pg_temp` sozinho não basta** para função que referencia objeto de outro
  schema sem qualificar; as 4 com `private`/`extensions` no caminho mantêm a
  ordem original e passam a ter `pg_temp` no fim.

## 7. Reproduzir

```bash
pnpm test:db -- tests/invariants/hardening-definer-propriedades.test.ts
node scripts/auditoria/auditar-listas.mjs   # instrumento vizinho (P1-06)
```
