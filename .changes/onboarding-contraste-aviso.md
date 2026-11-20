---
impacto: nada_mudou
secao: corrigido
titulo: Aviso do onboarding no tema escuro passa o contraste mínimo
---

No wizard, os textos secundários dos avisos âmbar (o de "Ele ainda não tem
cérebro", no passo de treinar, e o de sugestão de funil) usavam o cinza de
superfície sobre o fundo âmbar do tema escuro: **4,27:1**, abaixo do piso AA de
4,5 para texto normal — e o axe classificava como sério em 390 e 1440.

O aviso já declara a cor de texto própria; os secundários passaram a herdá-la em
vez de trocar para o cinza. Os detalhes de erro dos avisos de "atendente ficou
como rascunho" tinham o mesmo problema quando aparecessem e foram corrigidos
junto.

Nada a fazer na VPS.
