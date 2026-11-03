---
impacto: nada_mudou
secao: corrigido
titulo: A restrição do WhatsApp é lida pelo canal, não pela campanha
---

A 1.35.5 fez a campanha parar quando o WhatsApp restringe o número para abrir
conversa, mas a leitura do sinal ficou dentro da prospecção: ela conhecia o
nome da coluna do identificador da sessão e falava com o transporte por conta
própria. O gate que protege a doutrina de canais (`lint:channels`) reprovou — a
regra é que **nenhuma feature nomeia um provider**, e por isso o `ci` da `main`
ficou vermelho.

A leitura mudou de casa: agora é o canal que responde
(`lib/channels/restricao-de-alcance.ts`), pela mesma porta que o resto do
produto usa, e a restrição viaja junto do estado de saúde — na mesma resposta
que já diz se o canal está de pé, sem uma segunda ida à rede. A prospecção ficou
só com a política: quem a restrição atinge e o que o operador lê.

O comportamento que o operador vê não mudou: a campanha continua pulando com
`restricao_do_whatsapp` até o prazo e o "Enviar agora" continua recusando com
`409 whatsapp_restrito`. O que muda é que o próximo canal que tiver restrição de
alcance não vai precisar de código novo na campanha.
