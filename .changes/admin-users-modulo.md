---
impacto: nada_mudou
secao: corrigido
titulo: Admin — região rolável focável e ficha de usuário com alvos de 40 px
---

O `<main>` do admin rolava sem ser alcançável por teclado (axe
`scrollable-region-focusable` sério em toda tela a 390); ganhou `tabIndex={0}`.
Na ficha do usuário, o bloco de auditoria recente virou região rotulada e
focável, e o breadcrumb e os links de tenant ganharam 40 px de alvo. O `/admin`
passa a ser medido no destino (`/admin/dashboard`): axe 0/0 também a 390.
