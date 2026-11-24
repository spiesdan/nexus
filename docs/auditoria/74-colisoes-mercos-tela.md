# 74 — Pedidos do Mercos que ficaram de fora

> **Atualização 24/11:** a tela saiu do sistema por decisão do dono. A rota
> `GET /api/v1/mercos/colisoes` e a tabela `mercos_colisoes` continuam — o
> registro não foi apagado, só a superfície.

O dono achou sozinho o pedido 19669: nunca entrou, e ninguém viu. A tela responde em frase de dono — "este pedido do Mercos não entrou porque o número dele já estava usado por outro pedido aqui" — e mostra os dois lados nomeados, valor, data e estado (`não entrou` × `importado como nº X`), com uma ação por linha. A confirmação da importação nomeia as consequências sem inventar número local: usa o número do Mercos e diz que o pedido entra com o próximo número da série local. Se o backend informar `numero_local`, o número aparece na confirmação e no estado.

**Porta (removida em 24/11):** era ao lado de "Importar pedidos Mercos", na lista de Pedidos (`_client.tsx`). Nenhum item novo de menu; `navegacao-completude` leva a rota na allowlist com justificativa.

**Tolerância ao contrato:** a rota GET pode não estar na main ainda. Lista vazia = "Nenhum pedido do Mercos ficou de fora. Boa notícia: todos os pedidos do Mercos entraram." Erro 404 = aviso com "Tentar novamente"; erro de rede, idem. Cliente sem nome = "cliente não informado no Mercos"/"no CRM" — nada inventado.

Capturas (dado de contrato mockado; backend do G ainda não publicado): `docs/auditoria/capturas/colisoes-{cheio,vazio,erro}-{light,dark}_{1440,390}.png`. Medido: h1 único, overflow 0, console limpo nos estados cheio/vazio, nenhum controle novo abaixo de 44 px em 390.
