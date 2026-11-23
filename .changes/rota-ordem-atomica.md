---
impacto: nada_mudou
secao: corrigido
titulo: Ordem da rota é gravada em uma transação só (atrás de flag)
---

Antes, PATCH /rota/ordem gravava N sequências e só depois subia `rota_versao`;
uma falha no meio deixava sequência parcial com a versão antiga, e o motorista
aplicava uma rota diferente da que o escritório viu. Agora `fn_salvar_ordem_rota`
(0335) valida cobertura/separação antes de qualquer escrita, sobe a versão com
CAS e grava as sequências na mesma transação: qualquer falha rollbacka os dois.
A escrita fica atrás de `ROTA_ORDEM_ATOMIC=false` (padrão) — o dono liga depois
de `test:db` verde. Nem `publicarRota` nem a API mudaram de comportamento sem a
flag.
