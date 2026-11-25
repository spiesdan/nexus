---
impacto: nada_mudou
secao: corrigido
titulo: Uma regra com centenas de achados não esconde mais as outras no Sentinel
---

Medido em produção: o teto de ocorrências da organização é 500, a regra `fiscal.cliente_sem_endereco_fiscal` produziu 524 achados e a execução gravou `achados: 500` com `truncado: true` — **sem nenhuma** ocorrência de `operacao.mercos_importacao_falhou`, embora a importação do Mercos tivesse terminado com erro 11 h antes e a regra tivesse achado. O mecanismo que já existia impedia ENCERRAR a ocorrência de uma regra cortada, mas nunca a criava: a regra ficava num limbo — nem registrada, nem encerrada, nem visível. Agora cada regra que achou algo aparece pelo menos uma vez antes de qualquer regra repetir; o teto continua o mesmo, muda só quem fica de fora (quem tem 500 irmãos, não quem tem um achado só).
