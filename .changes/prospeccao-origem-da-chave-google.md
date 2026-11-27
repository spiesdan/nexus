---
impacto: capacidade_nova
secao: adicionado
titulo: A configuração de prospecção mostra de quem é a chave do Google
---

O GET da configuração de prospecção passa a devolver `chave_origem` com
`tenant`, `instalacao` ou `nenhuma`. Antes a tela só sabia dizer se havia chave;
agora ela mostra se o custo das consultas é da própria organização ou do dono da
instalação, sem nunca devolver a chave em si. A origem segue a resolução já
existente: a chave do tenant vence e a da instalação é o fallback.
