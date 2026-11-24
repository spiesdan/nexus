---
impacto: nada_mudou
secao: corrigido
titulo: Atualização não devolve mais a numeração local para 900 mil
---

O apêndice da 0344 no `baseline.sql` forçava `ultimo_numero = greatest(ultimo_numero, 900000)` em toda aplicação. Depois que a série passou a nascer em 70.000, cada `update.sh` empurrava o contador de volta para 900.000 — e o próximo pedido local nasceria 900001. O apêndice sai, a 0350 passa a ser idempotente em três estados (instalação fresca, já migrada e com números altos) e um invariante aplica o bloco duas vezes seguidas provando que o contador fica em 70006.
