---
impacto: nada_mudou
secao: corrigido
titulo: A varredura do Sentinel foi medida com 50 mil pedidos e 200 mil mensagens
---

O orçamento de detecção da varredura foi exercitado com volume realista: 50 mil
pedidos e 200 mil mensagens no banco local. O scan completo levou 1,1 s; a fase
de detecção, 37 ms para as 29 regras. Forçando o teto a zero no mesmo snapshot,
a rodada truncou e nenhuma regra foi avaliada — lista incompleta não encerra
ocorrência por ausência.

O teto de produção continua em 8 s, muito acima do medido. A medição é
reproduzível por `scripts/medir-sentinel-carga.ts`, que só roda em loopback e
exige confirmação explícita.
