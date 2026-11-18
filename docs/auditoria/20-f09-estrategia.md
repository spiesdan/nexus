# F-09 — a cadeia de migrations não reproduz o schema

> **FECHADO em 18/11/2026 — decisão do dono: caminho B (histórico morto).** A cadeia não é caminho de instalação; `supabase db push` é proibido. Medido em 16/11/2026 por execução, não por leitura:
> `bash scripts/auditoria/replay-migrations.sh` em Postgres 15.19 descartável. O relatório
> completo, com classificação de cada falha e o diff dos dois caminhos, está em
> [`12-migrations-e-rls.md`](12-migrations-e-rls.md). Este documento é a **decisão** que
> falta: o que fazer com o achado, quanto custa cada caminho e o que ele quebra.

## 1. O que está provado (e o que não está)

| Afirmação | Estado | Evidência |
|---|---|---|
| A cadeia de 292 migrations aplica do zero | **falso** | 35 aplicam, 257 falham |
| Alguma migration tem SQL inválido | **falso** | 0 em `syntax error` |
| As falhas são pré-requisito ausente | **verdadeiro** | 246 tabela, 8 função, 3 tipo — 257/257 citam objeto que **existe no `baseline.sql`** |
| A raiz é um defeito, não 257 | **verdadeiro** | **10 arquivos são `SELECT 1;`** (0001–0009 e 0013); 71 objetos distintos ausentes |
| O `baseline.sql` instala do zero | **verdadeiro** | `install.sh`/`update.sh`, exit 0 com `ON_ERROR_STOP=1`; `pnpm test:db` aplica em install **e** update |
| O caminho de migrations chega a quem instala | **falso hoje** | nenhum script do kit usa a cadeia; `db:migrate` aplica o baseline |

Consequência que o número esconde: **257 migrations marcadas como aplicadas num banco
parcial** é o pior resultado possível — pior que falhar, porque passa. É exatamente o que
`supabase db push` faria numa instalação que já tem schema.

## 2. Os três caminhos, com custo

### A — escrever as 10 fundações em SQL (a cadeia volta a reproduzir)

O que é: substituir cada stub `SELECT 1;` pelo DDL que ele representa, retirado do
`baseline.sql` (o schema real), e então rodar o replay até 292/292.

- **Custo medido do alvo**: 71 objetos distintos derrubam as 257 falhas; as fundações
  concentram os mais citados (`organizations` 43, `contacts` 15, `commercial_orders` 13,
  `conversations` 12, `agent_inbox_items` 9).
- **Risco alto**: essas 10 migrations estão registradas como aplicadas no
  `supabase_migrations.schema_migrations` de instalações existentes. Escrever DDL nelas
  **não** as re-executa ali (o registro existe) — mas quebra qualquer replay/`db push` num
  banco novo que já tenha o baseline, porque o DDL colide com objeto existente. Exige
  `if not exists` em cada objeto e um teste de idempotência contra o baseline.
- **Compatibilidade**: nenhuma remoção; só adição de DDL idempotente. Ainda assim, é
  reescrita de histórico e a doutrina pede plano de recuperação por arquivo.

### B — declarar a cadeia **não-executável** e manter o baseline como único caminho

O que é: aceitar o que já é fato operacional (o kit nunca usou a cadeia) e **tornar isso
uma regra com gate**, em vez de um detalhe que se descobre no restore.

- **Custo**: um documento (este), um gate e a doc de operação — já escrita em
  `README.md`/`docs/SETUP.md`.
- **Risco baixo**: não toca schema, não reescreve histórico.
- **Limite honesto**: não conserta a cadeia. Quem insistir em `supabase db push` continua
  com banco parcial. O gate reduz a chance (doc + ausência de script), não a elimina.

### C — híbrido: fundações geradas do baseline + replay como gate de CI

O que é: A feito por geração (extrair do `baseline.sql` o DDL dos 71 objetos, na ordem em
que as migrations os citam), com a cadeia rodando no CI como **teste**, não como
instalação.

- **Custo**: é A + um job de CI (o replay já leva minutos; o `test:db` já existe).
- **Risco médio**: o mesmo de A, mais o custo de manter duas representações do schema
  (baseline e cadeia) em sincronia — que é a origem do problema, não a solução, se não
  houver gate de diff entre as duas.
- **Veredito**: só vale se o dono quiser o `supabase db push` como caminho suportado. Hoje
  o produto não depende dele.

## 3. DECISÃO (18/11/2026): caminho B — a cadeia é histórico morto

**O dono autorizou B.** O schema oficial é `supabase/baseline.sql`; a cadeia de
292 migrations é **registro histórico** e **não é caminho de instalação**.
`db:migrate`, `db:reset`, `install.sh`, `update.sh` e `deploy.sh` aplicam o
baseline; `supabase db push`/`migration up`/`db reset` ficam **proibidos** e
documentados como tal (`supabase/migrations/README.md`, `CLAUDE.md`, SETUP,
README nos três idiomas). As 10 fundações **não** serão reescritas.

Razões registradas quando a recomendação foi escrita:

1. o produto **é** instalado pelo `baseline.sql`; a cadeia nunca foi caminho de instalação
   em nenhum script do kit (`install.sh`, `update.sh`, `deploy.sh`, `db:migrate`);
2. A/C mexem em histórico de schema — a doutrina proíbe reescrever sem plano de
   compatibilidade, e o plano depende de saber se existe instalação que usou `db push`
   (decisão do dono, não do agente);
3. o dano real hoje é **silencioso**: `db push` passa. Doc e gate atacam o silêncio; a
   reescrita ataca outra coisa.

O que **fica aberto** e não pode ser marcado `[x]`: a cadeia continua sem reproduzir o
schema. Enquanto isso, o item vive como `[!]` no prompt mestre, com esta decisão
registrada.

## 4. O que esta fatia entrega

| Entrega | Onde | Prova |
|---|---|---|
| Estratégia e custo por caminho | este arquivo | revisão |
| Catraca dos stubs: 10 nomeados; stub **novo** reprova | `tests/unit/cadeia-de-migrations-nao-e-instalacao.test.ts` | teste |
| Nenhum script do repo aplica a cadeia como instalação | idem (`package.json`, `hostgator-setup-kit/*.sh`) | teste |
| Doc de operação avisa em PT/EN/ES | `README.md`, `README.en.md`, `README.es.md`, `docs/SETUP.md` | teste lê o disco |
| Aviso ao dono | canal de atualizações + fila | mensagem |

## 5. Critério de conclusão de F-09 — cumprido em 18/11/2026

- **Decisão formal registrada**: B (histórico morto). ✅
- **Caminho proibido documentado e com catraca**: `supabase/migrations/README.md`,
  `CLAUDE.md` (item 7 da doutrina de migrations), SETUP e README pt/en/es;
  `tests/unit/cadeia-de-migrations-nao-e-instalacao.test.ts` reprova stub novo,
  script que aplique a cadeia e documentação que deixe de avisar. ✅
- **Caminho oficial único**: `baseline.sql` (install/update/deploy/db:migrate),
  validado por `pnpm test:db` em install **e** update. ✅
- **Fora de escopo por decisão**: reescrever as 10 fundações (caminhos A/C). ❌

F-09 fecha como `[x]` **por decisão**, não por reescrever histórico.

## 6. A prova executada (18/11/2026)

A decisão acima dizia *o que* é o caminho. Faltava provar que ele funciona ponta a
ponta — e foi isso que `scripts/auditoria/prova-f09.sh` passou a executar:

| Prova | Resultado medido |
|---|---|
| Nenhum executável aplica a cadeia (scripts/CI/kit/Docker/compose) | 0 invocações |
| Instalação em banco vazio (`ON_ERROR_STOP=1`) | 179 tabelas · 179 com RLS · 300 políticas · 288 funções · 104 triggers |
| Atualização sobre dados (o que o `update.sh` faz) | 0 linha perdida; objetos idênticos |
| ACL instalação × atualização (5.400 linhas) | `diff` vazio |
| `db:reset` reproduz a instalação | mesmos objetos · **ACL idêntico** |
| Restore ponta a ponta | PASSOU (inclui isolamento pós-restore) |

**Defeito achado pela prova**: o `db:reset` concedia `anon` em tabelas onde o dump
concede só `authenticated`/`service_role` (ex.: `ai_agent_runs`), porque estabelecia
DEFAULT ACL de **tabelas** antes de aplicar o baseline. Corrigido: o reset agora
restabelece apenas o DEFAULT ACL de funções, e o ACL canônico é o que o baseline
emite por tabela. Detalhe, diff e limites em
[`f09-prova-de-caminho-unico.md`](f09-prova-de-caminho-unico.md).

