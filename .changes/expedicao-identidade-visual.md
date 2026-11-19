---
impacto: nada_mudou
secao: alterado
titulo: Expedição ganha hierarquia visual e a ficha da carga abre com título e abas, não com blocos cinza
---

As cinco telas da expedição (lista, detalhe/paradas, rota, fechamento e motorista)
passaram por aplicação de identidade visual: número da carga como identificador
principal, estado com peso de texto e não de metadado, progresso colado na
contagem, contagem de grupo em pílula, endereço dito uma vez só na parada e as
ações destrutivas separadas do resto.

A ficha da carga (detalhe, rota, fechamento e motorista) pintava três retângulos
cinza até o fetch do cliente terminar — sem número, sem aba, sem dizer o que
carregava. Agora o servidor entrega número, status e abas, e o esqueleto tem a
forma do conteúdo com `aria-busy` e "Carregando a carga…".

Contraste: 0 textos abaixo do mínimo AA em 862 medições (445 no escuro, 417 no
claro). Nenhuma regra de negócio foi tocada.
