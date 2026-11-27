---
impacto: capacidade_nova
secao: adicionado
titulo: Prospecção aceita OSM ou Google na mesma busca, e a lista traz as coordenadas
---

A criação de uma busca de prospecção passa a aceitar o provider explícito entre
os habilitados: OpenStreetMap é sempre opção, Google Places entra quando a
instalação permite e há chave (do tenant ou da instalação), e sem o campo vale o
provider configurado. A escolha fica registrada na auditoria com a origem
(explícita ou configuração), e provider desconhecido ou não habilitado devolve
erro nomeado em vez de mensagem genérica. A descoberta pelo sidecar Maps segue
fora do seletor até 12/12.

A listagem das buscas passa a devolver latitude e longitude, então uma busca
criada por coordenada pode ser repetida na mesma área sem informar cidade outra
vez.
