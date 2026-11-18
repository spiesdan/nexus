---
impacto: nada_mudou
secao: corrigido
titulo: Campos de data/hora da agenda e as duas buscas voltam a mostrar onde está o foco
---

Seis campos da agenda (o motivo de uma remarcação e os cinco do cadastro de
horário) sinalizavam foco trocando `border-border` por `border-border-strong`:
a borda ia de 1,21:1 para 1,40:1. A mudança existe, mas é praticamente
invisível — na prática, quem navega por teclado perdia a posição.

Passam a usar o foco canônico do produto (borda accent + anel de 2 px), o mesmo
de todo `Input`. As duas buscas (a página `/app/busca` e a paleta ⌘K) escondiam
o anel no campo e não pintavam nada no lugar; agora o contêiner mostra o foco
com `focus-within`.

Nenhuma regra muda: só o indicador de foco.
