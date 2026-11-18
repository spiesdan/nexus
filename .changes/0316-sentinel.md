---
impacto: capacidade_nova
secao: adicionado
titulo: Sentinel — a operação inconsistente aparece antes de virar prejuízo
---

O Sentinel observa nota fiscal, pedido, recebível, estoque, fila, webhook,
importação do Mercos e campanha, e abre uma ocorrência com evidência, causa
provável e severidade quando encontra uma inconsistência. Ele **não** corrige,
não emite nota, não paga e não envia mensagem: a decisão continua com a equipe.

A varredura roda a cada 15 minutos (cada organização respeita o próprio
intervalo, padrão 6 horas) ou pelo botão **Sentinel** na busca (⌘K). Rodar de
novo não duplica ocorrências; a mesma ocorrência vista outra vez ganha
`vezes_vista` e volta como `recorrente` se já tinha sido fechada.

Desligar é uma decisão com dois níveis: `SENTINEL_ENABLED=false` no `.env`
desliga a instalação; a tela **Configurações › Sentinel** desliga apenas a
organização. Desligar não apaga histórico, e a retenção (padrão 180 dias) só
alcança ocorrências já encerradas, ignoradas ou corrigidas.
