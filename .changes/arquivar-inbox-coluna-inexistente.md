---
impacto: nada_mudou
secao: corrigido
titulo: Arquivar o inbox não quebrava com 500 — `comando_da_conversa` é função
---

**A rota de arquivar o inbox escrevia um campo que não existe.** Ela mandava
`comando_da_conversa: "encerrada"` no update, mas esse campo não é coluna: em
`supabase/baseline.sql:17146` é a **função**
`public.comando_da_conversa(c public.conversations)`, que o PostgREST resolve
no `?select=`. Escrever nela dá `column does not exist`, e o arquivamento
inteiro caía com 500 sem ter arquivado nada — em qualquer instalação, porque a
rotina é a mesma em todas.

Medido nesta instalação: `pg_proc` tem as duas funções, `pg_attribute` não tem
a coluna.

**O que torna isso enganoso:** `lib/database.types.ts` lista
`comando_da_conversa` como campo da Row de `conversations`. Lista porque
`supabase gen types` inclui função exposta pelo PostgREST no shape do schema —
o PostgREST devolve a função como coluna virtual. Então o TypeScript aceita, o
gerador concorda, e só o banco discorda. Conferir coluna lendo os tipos é o
caminho natural, e está errado.

**Por isso a defesa ficou em duas frentes.** Um teste de unidade proíbe a rota
de escrever o nome e checa que ela escreve as três colunas que "zerar o inbox"
significa. E um invariante pergunta ao Postgres de verdade: `pg_attribute`
confirma que a coluna não existe, `pg_proc` confirma que as funções existem, e
a função devolve um dos quatro valores do CHECK numa linha real.

O teste de unidade tem uma asserção de vácuo de propósito: um `for` sobre lista
vazia faz todo `expect` passar, então há um caso exigindo que a leitura das
colunas ache colunas conhecidas. Sem ele, o teste passaria verde com o parser
quebrado.

**Efeito colateral em produção:** o inbox foi zerado com a mesma regra da rota
(8 conversas arquivadas, 3 que já estavam fechadas preservadas, nenhuma
não-lida), e o ato ficou registrado em `api_audit_log` com a nota de que foi
SQL direto — a rota exige sessão autenticada.
