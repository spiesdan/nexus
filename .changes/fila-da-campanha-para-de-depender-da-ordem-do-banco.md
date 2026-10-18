---
impacto: nada_mudou
secao: corrigido
titulo: A fila da campanha para de depender da ordem em que o banco entrega as linhas
---

Medido na sua base (21.668 empresas) com a campanha de Videira: a tela mostrava
62 empresas quando 123 serviam à campanha. A fila não estava certa por critério
nenhum — a varredura lia as primeiras 10.000 linhas da base e parava, e como a
consulta não tinha ordem definida, *quais* 10.000 eram essas dependia da ordem
física da tabela.

Agora a varredura:

- lê a base inteira (teto de 50 páginas = 50.000 linhas), na ordem do `id`, que
  é estável;
- empurra o estado para o banco quando a campanha é de uma UF só, o que corta a
  varredura pela metade sem mudar a regra;
- e, quando duas empresas têm o mesmo nome na mesma cidade, vence a que tem
  telefone — antes vencia a que aparecesse primeiro, e a ordem de leitura muda
  a cada execução. Duas rodadas da mesma campanha davam 16 e 17 empresas sem
  telefone na fila; agora dão sempre as mesmas.

Videira × {Oficina mecânica, Borracharia, Autopeças, Posto de combustível}:
84 empresas na fila, 68 com telefone e 27 com WhatsApp potencial — as 27 são
as que o Disparo envia.