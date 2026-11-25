---
impacto: nada_mudou
secao: corrigido
titulo: Variáveis do Mercos documentadas passam a chegar ao container
---

`MERCOS_DE` e `MERCOS_ATE` foram criadas no `.env.example` e lidas pelo worker, mas **não** estavam no `docker-compose.prod.yml` — o `.env` da VPS dizia `01/01/2026` e `echo $MERCOS_DE` dentro do container respondia vazio. A recuperação de período simplesmente não acontecia. As duas entraram no compose, e um gate novo reprova a suíte quando uma `MERCOS_*` documentada no `.env.example` não é entregue ao container: env documentada e env entregue não podem divergir, porque a distância entre as duas é um recurso que não existe.
