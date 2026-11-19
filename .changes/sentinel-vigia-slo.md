---
impacto: capacidade_nova
secao: adicionado
titulo: Sentinel vigia os SLOs de disponibilidade e latência
---

A série de API criada na 0330 agora fecha o laço: a regra
`plataforma.slo_estourado` lê a janela de 7 dias por rota e abre uma ocorrência
para disponibilidade abaixo de 99,5% ou p95 acima de 800 ms, com pelo menos 100
amostras. A evidência traz janela, total, 5xx, p95 e as rotas que puxaram o
número. Sem amostra suficiente não abre nada; reexecutar atualiza a mesma
ocorrência pelo fingerprint estável.
