---
impacto: nada_mudou
secao: corrigido
titulo: Admin — sub-nav da ficha do tenant vira navegação e alvos de 40 px
---

A sub-nav usava `Tabs` sem `TabsContent` e anunciava `aria-controls` para um
painel inexistente — axe crítico nas quatro combinações. Virou `<nav>` com
links e `aria-current`, mantendo o desenho. Breadcrumb, abas,
“Impersonar tenant” e “Suspender tenant” ganharam o piso de 40 px: os alvos
pequenos caem de 7 (1440) e 5 (390) para zero.
