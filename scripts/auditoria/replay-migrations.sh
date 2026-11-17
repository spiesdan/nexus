#!/usr/bin/env bash
# =============================================================================
# OS DOIS CAMINHOS DE SCHEMA, MEDIDOS LADO A LADO — auditoria AAA, F-09.
# =============================================================================
# A pergunta não é "as migrations passam?". É:
#
#   1. O caminho de MIGRATIONS (o que `supabase db push` / `supabase db reset`
#      produzem) chega ao MESMO schema que o `baseline.sql` (o que o
#      `install.sh`/`update.sh` do cliente aplicam)?
#   2. Cada migration que falha falha por quê — SQL quebrado, ou pré-requisito
#      que a cadeia nunca criou?
#   3. O baseline tem RLS em todas as tabelas de tenant, e as 303 políticas
#      realmente filtram por organização?
#
# Por que isso importa: `package.json` declara `db:reset` = `supabase db reset` e
# `db:migrate` era um placeholder. Quem seguir esse caminho recebe um banco que
# "parece" pronto — as migrations rodam, o psql não reclama — e não está. Schema
# faltando aparece como 500 em produção, não como erro de migration.
#
# COMO MEDE: dois Postgres descartáveis, o MESMO preâmbulo nos dois
# (scripts/sql/preambulo-supabase-descartavel.sql — o mesmo arquivo que o gate
# `test:db` consome), um recebe as 292 migrations em ordem de nome, o outro
# recebe o baseline. Depois, o mesmo SELECT de inventário nos dois e `diff`.
#
# O que este script registra em disco (em docs/auditoria/evidencias/replay-migrations/):
#
#   ambiente.txt              versões, digest da imagem, sha256 do baseline, commit
#   console.log               a saída completa desta execução
#   migrations-resumo.tsv     por migration: ok/falhou, ms, classe, objeto, se o
#                             objeto ausente existe no baseline, erro literal
#   migrations-falhas/*.log   saída psql COMPLETA de cada migration que falhou
#   inventario-migrations.tsv / inventario-baseline.tsv
#   diff-inventario.txt       o diff dos dois inventários
#   politicas-baseline.tsv    política, comando, papéis, USING, WITH CHECK
#   rls-baseline.tsv / rls-migrations.tsv   diagnóstico de RLS
#   resumo.txt                os números, para citar sem redigitar
#
# Uso:
#   bash scripts/auditoria/replay-migrations.sh
#   IMAGE=pgvector/pgvector:pg17 bash scripts/auditoria/replay-migrations.sh
#
# Não toca em banco de ninguém: containers com --rm, nomes com $$.
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="${IMAGE:-pgvector/pgvector:pg15}"
BASELINE="$ROOT/supabase/baseline.sql"
DIR_MIGRATIONS="$ROOT/supabase/migrations"
PREAMBULO="$ROOT/scripts/sql/preambulo-supabase-descartavel.sql"
SQL_INVENTARIO="$ROOT/scripts/auditoria/inventario-schema.sql"
SQL_RLS="$ROOT/scripts/auditoria/diagnostico-rls.sql"
SAIDA="${SAIDA:-$ROOT/docs/auditoria/evidencias/replay-migrations}"

C_MIG="nexus-replay-mig-$$"
C_BASE="nexus-replay-base-$$"

[ -f "$BASELINE" ] || { echo "FATAL: $BASELINE não encontrado" >&2; exit 1; }
[ -f "$PREAMBULO" ] || { echo "FATAL: $PREAMBULO não encontrado" >&2; exit 1; }
[ -f "$SQL_INVENTARIO" ] || { echo "FATAL: $SQL_INVENTARIO não encontrado" >&2; exit 1; }
[ -f "$SQL_RLS" ] || { echo "FATAL: $SQL_RLS não encontrado" >&2; exit 1; }

case "$SAIDA" in
  "$ROOT"/docs/auditoria/*) ;;
  *) echo "FATAL: SAIDA precisa ficar sob docs/auditoria (recebido: $SAIDA)" >&2; exit 1 ;;
esac

rm -rf "$SAIDA"
mkdir -p "$SAIDA/migrations-falhas"

parar() {
  docker rm -f "$C_MIG" "$C_BASE" >/dev/null 2>&1 || true
}
trap parar EXIT INT TERM

# A saída inteira vai para o disco E para o terminal. Evidência que só existe no
# scrollback não é evidência: quem lê o relatório daqui a três meses precisa
# poder conferir a linha.
exec > >(tee "$SAIDA/console.log") 2>&1

agora_ms() { python3 -c 'import time; print(int(time.time()*1000))'; }

hash_arquivo() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

subir() {
  local nome="$1"
  docker run -d --rm --name "$nome" \
    -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=postgres "$IMAGE" >/dev/null || {
    echo "FATAL: docker não subiu $nome" >&2
    exit 1
  }
  local pronto=0
  for _ in $(seq 1 90); do
    if docker exec "$nome" psql -h 127.0.0.1 -U postgres -d postgres -c "select 1" >/dev/null 2>&1; then
      pronto=1; break
    fi
    sleep 1
  done
  [ "$pronto" = 1 ] || { echo "FATAL: $nome não ficou pronto em 90s" >&2; exit 1; }
}

# psql "cru": sem ON_ERROR_STOP, para leitura (inventário, versões).
psql_ler() { docker exec -i "$1" psql -U postgres -d postgres -t -A -F $'\t' -P pager=off -f -; }

echo "=============================================================="
echo " REPLAY DE MIGRATIONS × BASELINE — $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "=============================================================="
echo ""

echo "==> subindo os dois bancos descartáveis ($IMAGE)"
subir "$C_MIG"
subir "$C_BASE"

echo ""
echo "==> ambiente (vai para ambiente.txt)"
{
  echo "# Ambiente medido em $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo
  echo "## Repositório"
  echo "worktree:        $ROOT"
  echo "branch:          $(git -C "$ROOT" branch --show-current 2>/dev/null || echo desconhecido)"
  echo "commit:          $(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo desconhecido)"
  echo "arquivos sujos:  $(git -C "$ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  echo
  echo "## Docker e imagem"
  echo "docker:          $(docker --version)"
  echo "imagem pedida:   $IMAGE"
  echo "imagem id:       $(docker image inspect --format '{{.Id}}' "$IMAGE" 2>/dev/null || echo desconhecido)"
  echo "imagem digests:  $(docker image inspect --format '{{join .RepoDigests " "}}' "$IMAGE" 2>/dev/null || echo desconhecido)"
  echo "plataforma:      $(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$IMAGE" 2>/dev/null || echo desconhecida)"
  echo
  echo "## Cliente e servidor Postgres"
  echo "psql (cliente no container): $(docker exec "$C_MIG" psql --version)"
  echo "servidor:        $(psql_ler "$C_MIG" <<'SQL'
select version();
SQL
)"
  echo "server_version_num: $(psql_ler "$C_MIG" <<'SQL'
show server_version_num;
SQL
)"
  echo
  echo "## Insumos"
  echo "baseline:        $BASELINE"
  echo "baseline sha256: $(hash_arquivo "$BASELINE")"
  echo "baseline linhas: $(wc -l < "$BASELINE" | tr -d ' ')"
  echo "migrations:      $(ls "$DIR_MIGRATIONS"/*.sql | wc -l | tr -d ' ') arquivos"
  echo "preâmbulo:       $PREAMBULO"
  echo "preâmbulo sha256: $(hash_arquivo "$PREAMBULO")"
  echo
  echo "## Comandos exatos"
  echo "preâmbulo:  docker exec -i \$C psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f - < scripts/sql/preambulo-supabase-descartavel.sql"
  echo "migration:  docker exec -i \$C psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction -q -f - < <arquivo>"
  echo "baseline:   docker exec -i \$C psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f - < supabase/baseline.sql"
  echo "inventário: docker exec -i \$C psql -U postgres -d postgres -t -A -F \$'\\t' -f - < scripts/auditoria/inventario-schema.sql"
} | tee "$SAIDA/ambiente.txt"
echo ""

# -----------------------------------------------------------------------------
# PREÂMBULO — idêntico nos dois bancos
# -----------------------------------------------------------------------------
echo "==> aplicando o preâmbulo nos dois bancos (roles, auth.uid, storage, extensões, publicação)"
for c in "$C_MIG" "$C_BASE"; do
  if docker exec -i "$c" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f - <"$PREAMBULO" \
      >"$SAIDA/preambulo-${c}.log" 2>&1; then
    echo "    ok: $c"
  else
    echo "    FATAL: preâmbulo falhou em $c — ver $SAIDA/preambulo-${c}.log" >&2
    exit 1
  fi
done
echo ""

# -----------------------------------------------------------------------------
# CAMINHO A — as 292 migrations, em ordem de nome, cada uma na sua transação
# -----------------------------------------------------------------------------
# `--single-transaction` reproduz o `supabase db push`: migration que falha não
# deixa metade dos objetos para trás e contaminar o diagnóstico da seguinte.
echo "==> CAMINHO A — aplicando as migrations em ordem de nome (ON_ERROR_STOP=1)"
arquivo_erros="$SAIDA/tmp-erros.tsv"
: >"$arquivo_erros"
total=0
ok=0
falhou=0

for f in $(ls "$DIR_MIGRATIONS"/*.sql | sort); do
  total=$((total + 1))
  ordinal=$(printf '%03d' "$total")
  base=$(basename "$f" .sql)
  logtmp="$SAIDA/tmp-migration.log"
  t0=$(agora_ms)
  # Stub = só comentário + `SELECT 1;`. Medido, não adivinhado: conta comandos
  # DDL/DML reais fora de comentário.
  ddl=$(grep -vE '^[[:space:]]*(--|$)' "$f" \
        | grep -ciE '^[[:space:]]*(create|alter|insert|update|delete|drop|grant|revoke|comment|do|with|set|begin|commit)\b' || true)
  if [ "${ddl:-0}" = "0" ]; then
    tipo_arquivo="stub"
  else
    tipo_arquivo="sql"
  fi

  if docker exec -i "$C_MIG" psql -U postgres -d postgres \
        -v ON_ERROR_STOP=1 --single-transaction -q -f - <"$f" >"$logtmp" 2>&1; then
    ok=$((ok + 1))
    t1=$(agora_ms)
    printf '%s\t%s\tok\t%s\t%s\t-\t-\t-\t-\n' "$ordinal" "$base" "$((t1 - t0))" "$tipo_arquivo" >>"$SAIDA/migrations-resumo.tsv"
  else
    falhou=$((falhou + 1))
    t1=$(agora_ms)
    cp "$logtmp" "$SAIDA/migrations-falhas/${ordinal}_${base}.log"
    printf '%s\t%s\tfalhou\t%s\t%s\n' "$ordinal" "$base" "$((t1 - t0))" "$tipo_arquivo" >>"$arquivo_erros"
    echo "    FALHOU [$ordinal] $base"
  fi
done
echo "    migrations: $total · ok: $ok · falharam: $falhou"
echo ""

# -----------------------------------------------------------------------------
# CAMINHO B — o baseline, como o install.sh aplica
# -----------------------------------------------------------------------------
echo "==> CAMINHO B — aplicando supabase/baseline.sql (ON_ERROR_STOP=1, como o install.sh)"
log_base="$SAIDA/baseline-aplicacao.log"
if docker exec -i "$C_BASE" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f - \
      <"$BASELINE" >"$log_base" 2>&1; then
  echo "    ok: baseline aplicado"
else
  echo "    FATAL: o baseline NÃO aplica num Postgres limpo pg15 — ver $log_base" >&2
  tail -20 "$log_base" >&2
  exit 1
fi
echo ""

# -----------------------------------------------------------------------------
# INVENTÁRIOS + DIFF
# -----------------------------------------------------------------------------
echo "==> inventariando os dois schemas e diffando"
inv() { psql_ler "$1" <"$SQL_INVENTARIO"; }
inv "$C_MIG" >"$SAIDA/inventario-migrations.tsv"
inv "$C_BASE" >"$SAIDA/inventario-baseline.tsv"

contar() { cut -f1 "$1" | sort | uniq -c | awk '{printf "%s=%s ", $2, $1}'; }

echo "    migrations: $(contar "$SAIDA/inventario-migrations.tsv")"
echo "    baseline:   $(contar "$SAIDA/inventario-baseline.tsv")"
echo ""

# diff -u com o cabeçalho nomeando as duas fontes (o `diff` sozinho diz "a" e "b").
{
  echo "# Linhas '-' existem só no caminho de migrations; '+' só no baseline."
  echo "# Tipo 'tabela'/'funcao'/'trigger'/'politica' ausente em A e presente em B"
  echo "# = o baseline tem o objeto e a cadeia de migrations não o produz."
  echo
  diff -u -L "caminho A: 292 migrations" -L "caminho B: supabase/baseline.sql" \
    "$SAIDA/inventario-migrations.tsv" "$SAIDA/inventario-baseline.tsv" || true
} >"$SAIDA/diff-inventario.txt"

# `comm` compara BYTES; o `order by` do Postgres usa a collation do banco. Sem
# LC_ALL=C os dois discordam em nomes com acento e o comm responde errado.
LC_ALL=C sort "$SAIDA/inventario-migrations.tsv" >"$SAIDA/.inv-a.ordenado"
LC_ALL=C sort "$SAIDA/inventario-baseline.tsv" >"$SAIDA/.inv-b.ordenado"

so_em_a=$(comm -23 "$SAIDA/.inv-a.ordenado" "$SAIDA/.inv-b.ordenado" | wc -l | tr -d ' ')
so_em_b=$(comm -13 "$SAIDA/.inv-a.ordenado" "$SAIDA/.inv-b.ordenado" | wc -l | tr -d ' ')
comuns=$(comm -12 "$SAIDA/.inv-a.ordenado" "$SAIDA/.inv-b.ordenado" | wc -l | tr -d ' ')
# lista dos objetos que só o baseline tem, agrupada por tipo — é o que vira o
# "o que a cadeia não cria" do relatório.
comm -13 "$SAIDA/.inv-a.ordenado" "$SAIDA/.inv-b.ordenado" >"$SAIDA/so-no-baseline.tsv"
rm -f "$SAIDA/.inv-a.ordenado" "$SAIDA/.inv-b.ordenado"
echo "    objetos só no caminho de migrations: $so_em_a"
echo "    objetos só no baseline:             $so_em_b"
echo "    objetos nos dois:                   $comuns"
echo ""

# -----------------------------------------------------------------------------
# CLASSIFICAÇÃO DE CADA FALHA
# -----------------------------------------------------------------------------
# A pergunta do usuário é binária: "é migration quebrada ou pré-requisito
# ausente?". Quem responde é o SQLSTATE/erro do Postgres, não eu:
#
#   * `does not exist` / `no function matches` ⇒ a cadeia não criou o objeto que
#     esta migration referencia ⇒ pré-requisito ausente. E se o objeto EXISTE no
#     baseline, isso prova de onde ele deveria ter vindo.
#   * `already exists` / `duplicate` ⇒ a migration já aplicou (não idempotente
#     contra si mesma).
#   * `syntax error` / `invalid` ⇒ o texto SQL está errado.
#
# `existe_no_baseline` é a prova cruzada: objeto ausente em A e presente em B
# significa que o produto o tem e a CADEIA não o cria.
echo "==> classificando as $falhou falhas (e provando de onde vem cada objeto ausente)"
awk -F'\t' -v OFS='\t' '
function classe(e,    t) {
  t = e
  if (t ~ /no function matches/) return "prerequisito:funcao"
  if (t ~ /does not exist/ || t ~ /is not available/) {
    if (t ~ /^column .* of relation/)            return "prerequisito:coluna"
    if (t ~ /^relation/)                         return "prerequisito:tabela"
    if (t ~ /^function/)                         return "prerequisito:funcao"
    if (t ~ /^type/)                             return "prerequisito:tipo"
    if (t ~ /^schema/)                           return "prerequisito:schema"
    if (t ~ /^extension/)                        return "prerequisito:extensao"
    if (t ~ /^publication/)                       return "prerequisito:publicacao"
    if (t ~ /^operator/)                          return "prerequisito:operador"
    if (t ~ /^role/)                              return "prerequisito:role"
    return "prerequisito:outro"
  }
  if (t ~ /already exists/ || t ~ /duplicate/)     return "nao_idempotente"
  if (t ~ /syntax error/ || t ~ /is not valid/ || t ~ /invalid input/) return "sql_invalido"
  if (t ~ /permission denied/ || t ~ /must be owner/ || t ~ /insufficient privilege/) return "permissao"
  if (t ~ /cannot run inside a transaction block/) return "transacao"
  return "outro"
}
function objeto(e,    o) {
  if (match(e, /^column "[^"]+" of relation "[^"]+"/)) {
    o = e; sub(/^column "[^"]+" of relation "/, "", o); sub(/".*/, "", o); return o
  }
  if (match(e, /^(relation|type|schema|extension|publication|role) "[^"]+"/)) {
    o = e; sub(/^[a-z]+ "/, "", o); sub(/".*/, "", o); return o
  }
  if (match(e, /^function [^( ]+/)) {
    o = e; sub(/^function /, "", o); sub(/\(.*/, "", o); return o
  }
  if (match(e, /^operator [^( ]+/)) {
    o = e; sub(/^operator /, "", o); sub(/\(.*/, "", o); return o
  }
  # Postgres nem sempre cita o nome: `type public.conversations does not exist`
  # vem SEM aspas. Sem este ramo o objeto saía "-" e a prova cruzada não achava
  # nada — 1 caso medido (migration 0203).
  if (match(e, /^type [^ ]+ does not exist/)) {
    o = e; sub(/^type /, "", o); sub(/ does not exist.*/, "", o); return o
  }
  return "-"
}
# inventário do baseline: chave tipo+objeto
FNR==NR {
  if ($1 == "tabela" || $1 == "funcao" || $1 == "tipo" || $1 == "schema" || $1 == "extensao") {
    existe[$1 SUBSEP $2] = 1
  }
  next
}
{
  ord = $1; arq = $2; ms = $3; tipo_arq = $4
  # primeira linha de ERROR do log desta migration
  erro = "-"
  arquivo_log = LOGDIR "/" ord "_" arq ".log"
  while ((getline linha < arquivo_log) > 0) {
    if (linha ~ /ERROR:/ && erro == "-") {
      erro = linha
      sub(/^.*ERROR:[[:space:]]*/, "", erro)
      gsub(/\t/, " ", erro)
    }
  }
  close(arquivo_log)
  c = classe(erro)
  o = objeto(erro)
  # a prova cruzada, por classe
  achou = "nao"
  chave = ""
  # O erro do Postgres às vezes QUALIFICA o nome ("public.contacts") e às vezes
  # não ("buckets"). Prefixar sem olhar produzia "public.public.contacts" e a
  # busca no inventário falhava — 41 de 257 casavam por esse motivo, não por
  # ausência real do objeto no baseline.
  qualificado = (index(o, ".") > 0) ? o : "public." o
  if (c == "prerequisito:tabela")  chave = "tabela" SUBSEP qualificado
  if (c == "prerequisito:coluna")  chave = "tabela" SUBSEP qualificado
  if (c == "prerequisito:funcao")  chave = "funcao" SUBSEP qualificado
  if (c == "prerequisito:tipo") {
    chave = "tipo" SUBSEP qualificado
    # `type public.conversations does not exist` é o Postgres falando de uma
    # TABELA usada como tipo (`alter column … type public.x`), não de um enum.
    # Sem o fallback, a prova cruzada acusava "não existe no baseline" para um
    # objeto que está lá — 1 caso medido (migration 0203).
    if (!(chave in existe)) chave = "tabela" SUBSEP qualificado
  }
  if (c == "prerequisito:extensao") chave = "extensao" SUBSEP qualificado
  if (chave != "") {
    if (chave in existe) achou = "sim"
    else {
      # função com assinatura: casa por prefixo
      for (k in existe) {
        split(k, partes, SUBSEP)
        if (partes[1] == "funcao" && index(k, o "(") == length(partes[1]) + 2) { achou = "sim"; break }
      }
    }
  }
  print ord, arq, "falhou", ms, tipo_arq, c, o, achou, erro
}' LOGDIR="$SAIDA/migrations-falhas" \
   "$SAIDA/inventario-baseline.tsv" "$arquivo_erros" \
   >>"$SAIDA/migrations-resumo.tsv"

# ordena o resumo por ordinal (as linhas 'ok' já estão no lugar; as de falha
# foram acrescentadas depois).
sort -t"$(printf '\t')" -k1,1 "$SAIDA/migrations-resumo.tsv" -o "$SAIDA/migrations-resumo.tsv"
rm -f "$arquivo_erros" "$SAIDA/tmp-migration.log"

echo "    resumo por classe:"
awk -F'\t' '$3=="falhou" {print $6}' "$SAIDA/migrations-resumo.tsv" \
  | sort | uniq -c | sort -rn | sed 's/^/      /'
echo "    falhas cujo objeto ausente EXISTE no baseline: $(awk -F'\t' '$3=="falhou" && $8=="sim"' "$SAIDA/migrations-resumo.tsv" | wc -l | tr -d ' ')"
# DOIS números, porque o primeiro já mentiu. O erro do Postgres às vezes qualifica
# o nome ("public.conversations") e às vezes não ("conversations", quando o search_path
# resolve). Contar as strings cruas soma o MESMO objeto duas vezes: deu 81 quando os
# objetos distintos eram 71 — 10 nomes sem schema repetiam um já citado qualificado.
# O canônico prefixa `public.` quando não há schema; o cru fica ao lado para que a
# diferença seja visível em vez de virar número único sem procedência.
echo "    objetos distintos ausentes (canônico): $(awk -F'\t' '$3=="falhou" && $7!="-"{o=$7; if (o !~ /\./) o="public."o; print o}' "$SAIDA/migrations-resumo.tsv" | sort -u | wc -l | tr -d ' ')"
echo "    objetos distintos ausentes (texto cru): $(awk -F'\t' '$3=="falhou" && $7!="-"' "$SAIDA/migrations-resumo.tsv" | cut -f7 | sort -u | wc -l | tr -d ' ')"
echo "    migrations stub (só SELECT 1): $(awk -F'\t' '$5=="stub"' "$SAIDA/migrations-resumo.tsv" | wc -l | tr -d ' ')"
echo ""

# -----------------------------------------------------------------------------
# POLÍTICAS E RLS — nos dois bancos
# -----------------------------------------------------------------------------
echo "==> extraindo políticas e diagnóstico de RLS"
psql_ler "$C_BASE" <<'SQL' >"$SAIDA/politicas-baseline.tsv"
select schemaname, tablename, policyname, cmd,
       array_to_string(roles, ','),
       coalesce(regexp_replace(qual, '\s+', ' ', 'g'), '-'),
       coalesce(regexp_replace(with_check, '\s+', ' ', 'g'), '-')
from pg_policies
order by schemaname, tablename, policyname;
SQL
psql_ler "$C_BASE" <"$SQL_RLS" >"$SAIDA/rls-baseline.tsv"
psql_ler "$C_MIG" <"$SQL_RLS" >"$SAIDA/rls-migrations.tsv"

echo "    políticas no baseline (todas as schemas): $(wc -l < "$SAIDA/politicas-baseline.tsv" | tr -d ' ')"
echo "    políticas no baseline (public):           $(awk -F'\t' '$1=="public"' "$SAIDA/politicas-baseline.tsv" | wc -l | tr -d ' ')"
echo "    diagnóstico RLS (baseline):"
awk -F'\t' '{print $1}' "$SAIDA/rls-baseline.tsv" | sort | uniq -c | sort -rn | sed 's/^/      /'
echo ""

# -----------------------------------------------------------------------------
# RESUMO CITÁVEL
# -----------------------------------------------------------------------------
{
  echo "REPLAY DE MIGRATIONS × BASELINE — resumo"
  echo "medido: $(date -u '+%Y-%m-%dT%H:%M:%SZ') · commit $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null)"
  echo "imagem: $IMAGE ($(docker image inspect --format '{{.Id}}' "$IMAGE" 2>/dev/null | cut -c1-19))"
  echo
  echo "caminho A (migrations): $total arquivos · $ok ok · $falhou falhas"
  echo "caminho B (baseline):   aplica com ON_ERROR_STOP=1: sim"
  echo
  echo "objetos no caminho A: $(contar "$SAIDA/inventario-migrations.tsv")"
  echo "objetos no caminho B: $(contar "$SAIDA/inventario-baseline.tsv")"
  echo "só em A: $so_em_a · só em B: $so_em_b · nos dois: $comuns"
  echo
  echo "objetos ausentes no caminho A, por tipo (distintos):"
  cut -f1 "$SAIDA/so-no-baseline.tsv" | sort | uniq -c | sort -rn | awk '{printf "  %-12s %s\n", $2, $1}'
  echo
  echo "falhas por classe:"
  awk -F'\t' '$3=="falhou" {print $6}' "$SAIDA/migrations-resumo.tsv" | sort | uniq -c | sort -rn | awk '{printf "  %-28s %s\n", $2, $1}'
  echo
  echo "objetos distintos ausentes (canônico): $(awk -F'\t' '$3=="falhou" && $7!="-"{o=$7; if (o !~ /\./) o="public."o; print o}' "$SAIDA/migrations-resumo.tsv" | sort -u | wc -l | tr -d ' ')"
  echo "objetos distintos ausentes (texto cru): $(awk -F'\t' '$3=="falhou" && $7!="-"' "$SAIDA/migrations-resumo.tsv" | cut -f7 | sort -u | wc -l | tr -d ' ')"
  echo
  echo "tabelas public:   A=$(grep -c '^tabela\tpublic\.' "$SAIDA/inventario-migrations.tsv" || true) · B=$(grep -c '^tabela\tpublic\.' "$SAIDA/inventario-baseline.tsv" || true)"
  echo "RLS ligado public: A=$(grep -c '^rls_ligado\tpublic\.' "$SAIDA/inventario-migrations.tsv" || true) · B=$(grep -c '^rls_ligado\tpublic\.' "$SAIDA/inventario-baseline.tsv" || true)"
  echo "funções public:   A=$(grep -c '^funcao\tpublic\.' "$SAIDA/inventario-migrations.tsv" || true) · B=$(grep -c '^funcao\tpublic\.' "$SAIDA/inventario-baseline.tsv" || true)"
  echo "triggers public:  A=$(grep -c '^trigger\tpublic\.' "$SAIDA/inventario-migrations.tsv" || true) · B=$(grep -c '^trigger\tpublic\.' "$SAIDA/inventario-baseline.tsv" || true)"
  echo "políticas public: A=$(grep -c '^politica\tpublic\.' "$SAIDA/inventario-migrations.tsv" || true) · B=$(grep -c '^politica\tpublic\.' "$SAIDA/inventario-baseline.tsv" || true)"
  echo "políticas (todas as schemas) no baseline: $(wc -l < "$SAIDA/politicas-baseline.tsv" | tr -d ' ')"
  echo "diagnóstico RLS (baseline):"
  awk -F'\t' '{print $1}' "$SAIDA/rls-baseline.tsv" | sort | uniq -c | sort -rn | awk '{printf "  %-28s %s\n", $2, $1}'
} >"$SAIDA/resumo.txt"

cat "$SAIDA/resumo.txt"
echo ""
echo "==> evidência em $SAIDA"
