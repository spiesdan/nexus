---
impacto: nada_mudou
secao: corrigido
titulo: Matriz 41 passa a cobrir o 404 e os dois boundaries de erro
---

A matriz de cobertura listava 26 superfícies fora de `app/app` e `app/admin`, mas
`app/not-found.tsx`, `app/error.tsx` e `app/global-error.tsx` não apareciam em
lugar nenhum — o E2E conferia a cópia do `/404`, não a tela.

O 404 foi medido no navegador em claro/escuro × 1440/390: **0** textos abaixo do
contraste mínimo, **0** overflow e **0** violação séria no axe. Os dois boundaries
não têm rota de gatilho no produto (medir exigiria inventar uma exceção) e
ganharam prova unitária de estrutura, nomes e reset; a lacuna de navegador está
declarada na matriz, não escondida.

Nada a fazer na VPS.
