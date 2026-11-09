---
impacto: nada_mudou
secao: corrigido
titulo: O agente parou de apresentar 2 produtos como se fossem o catálogo inteiro
---

Quem perguntou "tem papel higiênico?" recebeu duas opções — e, ao perguntar "mas tem muito mais no sistema, por que não listou todos?", descobriu que havia oito. O agente não inventou: ele recebeu uma amostra de oito itens de quarenta e respondeu com os dois que tinham estoque, sem saber que os outros existiam.

Três defeitos se somavam. O dispensador, que vende o papel e não é o papel, era classificado como produto principal e ocupava três dos oito lugares — inclusive o topo, onde dois dispensers empatavam entre si e faziam a busca pedir uma escolha que não era a do cliente. O corte de oito escondia justamente o fofinho de 64 rolos, o único de fora que tinha saldo. E o número "40" chegava solto, sem forma: não dizia quais eram as outras opções nem em que faixas.

Agora o dispensador entra como acessório (e continua sendo resposta para quem pede dispensador), a busca devolve um resumo com quantas opções do pedido existem, quantas são apenas parecidas — papel toalha para quem pediu papel higiênico — e quantas são acessórios, agrupadas por tamanho com preço e saldo. Um guardrail novo barra a resposta que cita preço de menos de um terço das opções sem dizer que há mais. O caso real virou teste com os oito produtos e os três dispensers do catálogo.
