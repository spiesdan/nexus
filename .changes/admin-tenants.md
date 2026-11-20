---
impacto: nada_mudou
secao: corrigido
titulo: Admin — alvos de toque da lista de tenants
---

O link “Ver” de cada linha media 18×15 px e o botão “Novo tenant” 115×32; os
filtros ficavam em 36 px. Todos ganharam o piso de 40 px da casca do admin, sem
mudar o desenho: os alvos pequenos da tela caem de 20 (1440) e 19 (390) para
zero. Overflow, contraste, axe e console já estavam limpos.
