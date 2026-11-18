---
impacto: capacidade_nova
secao: adicionado
titulo: Retransmissão de inutilização e carta de correção também honra Idempotency-Key
---

As duas retransmissões fiscais que ainda criam efeito externo passam a usar o
mesmo contrato da emissão: a chave é reivindicada antes de falar com a SEFAZ,
o retry com a mesma chave devolve a resposta original com
`Idempotency-Replayed: true`, e a mesma chave com outro evento é
`409 idempotency_conflict`. Falha no meio do caminho libera a chave.
