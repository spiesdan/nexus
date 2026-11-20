---
impacto: capacidade_nova
secao: adicionado
titulo: Sonda interna prova o instrumento de métricas sem poluir os SLOs
---

A série de API podia estar vazia por falta de tráfego ou por instrumento mudo.
Agora `POST /api/internal/observabilidade/sonda` (protegida por
`INTERNAL_CRON_SECRET`) grava uma sonda em `api_request_probes` e devolve id,
instante e duração; a tela de observabilidade mostra a última. A sonda não entra
em `api_request_samples` — contagem, idade e retenção da série ficam intactas.
Se a sonda funciona e a série continua zero, o problema é tráfego.
