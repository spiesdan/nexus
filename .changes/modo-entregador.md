---
impacto: nada_mudou
secao: adicionado
titulo: "Modo entregador: login que abre só a expedição, com o mapa em tela cheia"
---

- **login de entregador**: o convite (Equipe → Convidar) ganhou a opção
  **Modo entregador**. Quem entra por ele cai direto na expedição: sem menu, sem
  topbar, sem dock — só as cargas **na rua**, e a saída no canto da tela;
- **a cabine virou app de mapas**: mapa em tela cheia (`100%` da altura), placar
  flutuante com `feitas/total` e a próxima entrega numa folha que sobe do
  rodapé, com os botões de cheguei/entregue ao alcance do dedo. A folha abre o
  roteiro inteiro; o mapa nunca sai do lugar;
- **"você está aqui"**: com o rastreio ligado, a posição do celular aparece no
  mapa (antes só o painel via o rastro, minutos depois);
- **o mapa se redimensiona sozinho** quando a barra do navegador recolhe ou o
  aparelho gira — antes sobrava faixa cinza até recarregar;
- a flag é `user_organizations.motorista` (0292) e **não concede permissão**:
  o acesso continua sendo o `role`, que é o que as policies de `shipments`
  leem. Desligar a flag devolve menu e home na hora.

Para ligar/desligar em quem já é membro: Equipe → menu da linha → *Ligar modo
entregador*.
