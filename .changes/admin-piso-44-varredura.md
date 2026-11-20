---
impacto: nada_mudou
secao: corrigido
titulo: Admin passa a ter piso de toque de 44 px em todas as telas da casca
---

Varredura de 22 rotas de admin (88 medições em build de produção, claro/escuro
× 1440/390): 19 telas tinham alvos de 40–36 px, residual da régua anterior. O
piso de 44×44 agora mora na casca (`data-admin-shell` + regra escopada), então
vale para os filtros que ainda vão nascer. As 22 rotas mediram **0 alvos < 44**, com h1, overflow, axe, console e
contraste limpos. Fora da casca, a primitiva `StatusPage` também subiu para
44 px; `/admin/forbidden` foi remediado nos 4 contextos depois que o swap
liberou (a primeira tentativa foi interrompida pela regra de máquina).
