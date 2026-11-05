---
impacto: nada_mudou
secao: corrigido
titulo: O aviso de entrega sai no "Sair para rota" e fala com o cliente, não com a doca
---

Quando o pedido entrava numa carga, o cliente recebia um texto que explicava a logística de dentro de casa: que o pedido tinha sido **separado**, que entrou na **carga nº 25** e que ela estava *programada* para sair. Só que isso acontecia na hora de montar a carga — o caminhão ainda estava na doca — e o cliente lia um aviso técnico sobre um processo que ele não vê e não pediu para acompanhar.

Agora o aviso tem dois consertos, um de gatilho e um de texto:

- **Sai só quando a rota sai para a rua.** O envio aconteceu ao clicar em **Sair para rota**, na ficha da carga — é o momento em que o pedido realmente saiu para entrega. Montar a carga ou acrescentar pedido a uma carga que ainda está na doca não dispara nada.
- **Fala como gente.** A mensagem é só a saudação pelo horário da empresa (bom dia, boa tarde ou boa noite, no fuso configurado em Configurações › Empresa) seguida do fato: *"Seu pedido PED-0007 saiu para entrega. 🚚 Em breve ele chega até você."* Sem carga, sem separação, sem promessa de prazo.

A entrega do aviso continua best-effort: se o WhatsApp falhar, a rota sai do mesmo jeito e nada na operação trava.
