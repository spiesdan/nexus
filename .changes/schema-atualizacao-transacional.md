---
impacto: nada_mudou
secao: corrigido
titulo: Atualização aplica o schema em uma transação só
---

No aborto da 1.63.0, o `update.sh` rodava o baseline statement por statement: a
migration 0334 falhou e a 0335 já tinha sido commitada, deixando o schema à
frente do código sem ninguém perceber. O passo de schema de `update.sh` e
`deploy.sh` agora roda com `psql -1` (`--single-transaction`): qualquer erro
desfaz tudo e a atualização para antes de trocar as imagens. A mensagem continua
apontando `psql:<stdin>:<linha>: ERROR: ...`. Não há `CREATE INDEX
CONCURRENTLY`, `VACUUM` nem `CREATE DATABASE` no baseline, então `-1` é viável
sem exceção.
