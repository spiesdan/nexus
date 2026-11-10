---
impacto: capacidade_nova
secao: adicionado
titulo: Inbox ganha opção de marcar contato como sem envio
---

Quando um cliente pede para não receber mais nada, a decisão humana tomada na conversa agora vira a parada dura do contato: o atendente marca "sem envio" no header do inbox e o sistema grava `contacts.is_blocked` (motivo `manual`) — o mesmo estado do opt-out por palavra (`STOP`) — que o guard de before-send, o comando da conversa e o worker já respeitam. Antes, pedir "não me mande mais nada" em conversa não chegava ao estado; a parada só nascia da palavra-chave.

A linha da timeline ganha o tipo `contact_no_send` ("Marcou o contato sem envio").
