---
impacto: nada_mudou
secao: corrigido
titulo: O aviso deixa de pintar com a paleta da biblioteca
---

O aviso (toast) era o único feedback do produto que pintava fora do design
system: a biblioteca escolhia as cores de sucesso, erro, aviso e informação, sem
passar pelo tema nem pela régua de contraste.

Agora os quatro tipos usam os nossos tokens semânticos, e o texto passa AA sobre
o fundo **composto** (o token translúcido sobre a superfície, que é a cor que se
vê): sucesso 5,7 no claro e 6,1 no escuro; aviso 5,3 e 6,2; erro 6,5 e 5,3;
informação 6,1 e 6,4.

O aviso sem tipo continua na superfície com o texto do produto. Nenhum fluxo
muda: só a cor de quem informa.
