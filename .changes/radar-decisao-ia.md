---
impacto: capacidade_nova
secao: adicionado
titulo: "O radar passa a dizer o que fazer, nao so quem esfriou"
---

O radar de risco já avisava **quem** esfriou; agora guarda **o que fazer** a
respeito. A cada travessia fria o motor local (o `laya-serve` que roda na mesma
VPS) responde uma decisão por negócio — reativar, aguardar ou encerrar — com a
confiança e o modelo que respondeu. A sugestão é avaliação, não estado: fica
**fora** da publicação realtime de propósito, porque regravá-la a cada tick
publicaria evento sem mudança visível. A tela do radar lê junto, por request.
A escrita exige `manager+` (migration 0259): um `agent` falando direto com o
PostgREST não encerra o próprio lead.