---
impacto: nada_mudou
secao: alterado
titulo: Avisos de WhatsApp caído e de fila saem do topo e do menu; ficam só na Central
---

Decisão do dono: sem faixa no topo, sem contador no rodapé do menu. A conexão caída já entra em `agent_inbox_items` — a mesma fonte que a Central (o sino) lê —, então nada se perde: o alerta aparece lá, com o texto que diz o que fazer. A faixa sticky comia ~40 px de toda tela e o "N na fila" do rodapé repetia um número que já tem filtro próprio no inbox. O invariante `channel-health-aviso` mudou junto: em vez de exigir a faixa no layout, exige que o aviso chegue à fonte da Central — a garantia que importa quando a superfície muda.
