---
impacto: nada_mudou
secao: corrigido
titulo: Casca do admin passa a ter alvos de toque de 44 px
---

Sidebar, topbar, busca, menu do usuário e banner do admin ganharam piso de 44 px
no desktop (antes 28–36). O dashboard mediu 16 → 1 e 2 → 1 alvos abaixo de 40 px
em 1440 e 390 — o que resta é só o skip-link `sr-only` 1×1, nenhum alvo visível —
sem overflow, erro de console ou contraste reprovado. As telas
filhas herdam a casca; o conteúdo de cada uma segue em auditoria própria.
