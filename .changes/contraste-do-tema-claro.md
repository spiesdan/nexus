---
impacto: nada_mudou
secao: corrigido
titulo: Texto secundário do tema claro volta a passar no contraste AA
---

No tema claro, o tom de texto mais discreto (`text-subtle`, usado em rótulo de
dia, contagem de pedidos, "desativado" e meta de linha) media **2,85:1** sobre o
cartão branco — o piso AA para texto normal é 4,5:1. Eram 74 usos de texto que
se lê, em 11 px na maioria.

Agora mede 5,02:1 sobre o cartão, 4,69:1 sobre o fundo da página e 4,81:1 sobre
a superfície elevada. O tema escuro já tinha sido corrigido pelo mesmo motivo; o
claro ficou para trás porque o teste estático tratava esse token como decoração
e o instrumento de contraste rodava só no tema padrão.

O tom discreto continua mais claro que o secundário — a hierarquia não mudou,
só o degrau passou a ser legível. O instrumento de contraste e o de tokens agora
medem os **dois** temas e reprovam o que não passa.
