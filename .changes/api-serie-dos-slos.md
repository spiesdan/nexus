---
impacto: capacidade_nova
secao: adicionado
titulo: Disponibilidade e latência dos SLOs passam a ter série de verdade
---

As duas primeiras metas do doc 42 não tinham série: 5xx era só log e duração não
era persistida. Agora as cinco rotas quentes gravam uma amostra por requisição
em `api_request_samples` — rota, status, duração, código de 5xx, request id e a
organização quando há — sem body/PII/mensagem, depois da resposta. A tela
`/admin/observabilidade` calcula 5xx/total e p95 da janela de 7 dias e continua
dizendo “sem histórico” enquanto não houver 100 amostras. A retenção de 7 dias
roda em lotes no cron diário.
