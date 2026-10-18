---
impacto: nada_mudou
secao: corrigido
titulo: Campanha alcança a empresa pela categoria que a base gravou
---

A aba Campanhas filtrava a categoria comparando o texto da campanha com o texto
gravado na base, letra por letra. Só que a base guarda o rótulo que a API do
Google devolveu, **em inglês** ("Auto repair shop", "Gas station", "Tire repair
shop"), e a campanha é montada em português ("Oficina mecânica", "Posto de
combustível", "Borracharia"). O resultado era uma fila quase vazia sem aviso
nenhum: medido em Videira/SC, a campanha "Oficinas - SC" alcançava **1** das
1.268 empresas da cidade.

Agora as duas pontas falam a mesma língua. O termo da campanha é convertido nos
rótulos que ele descreve, pelo mesmo mapa de tradução que o filtro da aba
Empresas já usava — e a tradução é feita uma vez por campanha, não uma vez por
empresa da base. Categoria fora da campanha continua fora, e empresa sem
categoria continua fora.