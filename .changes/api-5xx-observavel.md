---
impacto: nada_mudou
secao: corrigido
titulo: Erro 5xx devolvido pela API passa a deixar rastro
---

Resposta 5xx devolvida por `fail()` não é exceção: o Next nunca a entrega ao
`onRequestError` do Sentry, e ela não aparecia em contagem nenhuma. O wrapper
agora emite uma linha estruturada `api.5xx` com código, status e request id —
sem a mensagem nem detalhes, que podem carregar dado de negócio. É a fonte
mínima do SLI de disponibilidade do doc 42; 4xx não gera a linha.
