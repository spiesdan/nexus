---
impacto: nada_mudou
secao: corrigido
titulo: A trilha para de oferecer link sem destino e o sino anuncia o que chega
---

Duas correções na casca, as duas de acessibilidade e nenhuma de regra.

**Trilha de navegação:** segmento que o registro não conhece (rota legada, tela
nova ainda não registrada) entrava como `<Link href="#">` — uma migalha que
parece link, entra na ordem de Tab e, ao ser ativada, joga a pessoa no topo da
página. Migalha sem destino agora é texto: não recebe foco e não promete
navegação.

**Central de avisos:** o total em aberto só era lido por leitor de tela quando o
foco passava pelo sino. Quem está digitando no inbox recebia um aviso novo em
silêncio. Agora existe uma região viva que anuncia o novo total — e só quando o
número **aumenta**: a carga inicial não é novidade e uma recontagem que cai é
ajuste, não alerta.
