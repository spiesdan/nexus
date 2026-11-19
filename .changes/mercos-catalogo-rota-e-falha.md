---
impacto: nada_mudou
secao: corrigido
titulo: Coleta do catálogo do Mercos acha a rota certa e falha alto quando volta vazia
---

A coleta do catálogo pedia `/<empresa>/produtos/`, que responde 404 nesta
instalação — e o Playwright não lança em 404, então ela lia zero linhas e
terminava com `produtos_lidos: 0` e exit 0. A rota real é
`/industria/<empresa>/produtos/` (é a que o menu aponta; ela é descoberta ali,
porque o segmento muda com o tipo de conta), com as rotas fixas como rede.

Coleta vazia deixou de ser sucesso: nenhuma página lida e página lida sem linha
são falhas distintas, com motivo no log e exit 1.

Medido em produção: **601 produtos em 41 páginas**, cabeçalho lido por inteiro;
433 com código e preço legível, 162 sem código no ERP (relatados por nome),
6 com código repetido.
