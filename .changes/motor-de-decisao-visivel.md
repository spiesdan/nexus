---
impacto: nada_mudou
secao: corrigido
titulo: Radar e Prospecção dizem quando o motor de decisão está fora
---

Quando o motor local (laya) está configurado mas não responde, a sugestão
automática some — e até hoje isso aparecia como "nada a sugerir". Agora o cron
registra a falha num incidente (`laya.motor_indisponivel`), o Radar e a
Prospecção mostram o aviso "Sugestão automática desligada: o motor de decisão não
respondeu" com a última falha e o que revisar, e a linha sem sugestão ganha o
selo "Sugestão indisponível" em vez de silêncio. O primeiro sucesso fecha o
incidente sozinho. `/admin/observabilidade` ganha o cartão do motor com estado e
última falha, e `/api/v1/laya/saude` expõe o mesmo fato por organização. Nada
desliga sozinho e nada tenta de novo — é visibilidade, não comportamento.
