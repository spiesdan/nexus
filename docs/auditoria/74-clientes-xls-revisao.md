# 74 — Clientes do XLS com nome idêntico: lista para revisão

> **Somente leitura.** Nenhum merge foi aplicado. Esta lista é insumo de decisão do dono; não vai para a tela.

> **Reconciliação com o número 792 citado:** não o reproduzi com o critério descrito. Com nome normalizado (maiúsculas/sem acento/espaços colapsados) contra contatos pré-existentes sem documento, o XLS produz **920** linhas; com igualdade exata produz 878; com nome + cidade + telefone, 42. O 792 pode vir de regra de normalização ou arquivo diferente do que tenho aqui. Não adotei o número sem poder medi-lo — a lista abaixo é a que o comando reproduce.

## O que dá para afirmar

- **920** linhas do XLS têm nome normalizado idêntico a um contato pré-existente sem documento.
- **110** têm telefone idêntico (prova forte).
- **325** têm só o nome em comum — risco de falsa identidade.
- **118** têm pedido no CRM: o endereço atual importa mais nesses.
- **42** são `provável mesmo` (nome + cidade + telefone). Os demais ficam `revisar`.

## Critério conservador

`provável mesmo` exige nome normalizado (maiúsculas, sem acento, espaços colapsados), cidade e telefone (só dígitos) iguais. Qualquer campo faltante cai em `revisar`. Nenhuma atribuição automática e nenhuma sugestão por IA.

A lista completa, com os dados de cada lado, está em `74-clientes-xls-revisao.csv`.

| Veredito | Linhas |
|---|---:|
| revisar | 878 |
| provável mesmo | 42 |

## Primeiras 30 linhas

| XLS | Nome (XLS) | CNPJ (XLS) | Cidade/UF | Tel. igual | Pedido | Veredito |
|---|---|---|---|---|---|---|
| 3 | A. YOSHII ENGENHARIA E CONSTRUÇÕES LTDA | 78016003005170 | / | não | não | revisar |
| 4 | A.M.A LOCACOES E SERVICOS LTDA | 19518491000195 | Araquari/ | não | não | revisar |
| 5 | AÇOUGUE REINERT - RODRIGO RENE REINERT | 10684828000160 | / | não | não | revisar |
| 6 | ADANTEX INDUSTRIA E COMERCIO DE ESTOPAS LTDA EPP | 85276889000197 | Itajaí/ | não | não | revisar |
| 10 | ADGON INDUSTRIA E COMERCIO DE MADEIRAS EIRELI | 21206855000143 | Monte Castelo/ | não | não | revisar |
| 11 | ADRIANE AGAZZI MADEIRAS | 13444976000103 | Palmeira/ | não | não | revisar |
| 12 | ADRIANO CESAR MAYER & CIA LTDA | 07363188000181 | / | não | não | revisar |
| 13 | ADRIANO WENDT 94845301920 | 34247012000137 | Canoinhas/ | sim | não | provável mesmo |
| 14 | ADRISAL ALIMENTOS LTDA | 10456233000157 | Canoinhas/ | não | não | revisar |
| 16 | AGM - PECAS E LUBRIFICANTES LTDA. | 08275320000166 | Mafra/ | não | não | revisar |
| 17 | AGNALDO | 85129518000182 | / | não | não | revisar |
| 18 | AGRIMAPAS ASSESSORIA AGRO FLORESTAL LTDA | 10481291000130 | Canoinhas/ | não | não | revisar |
| 20 | AGRO CAMPO MAQUINAS E IMPLEMENTOS AGRICOLAS EIRELI | 34246225000144 | Irineópolis/ | não | não | revisar |
| 21 | AGRO FLORESTAL ARISTIDES MALLON LTDA | 08284920000190 | Canoinhas/ | não | sim | revisar |
| 23 | AGRO SEPAC AGROPEÇAS | 27705080000137 | / | não | não | revisar |
| 27 | AGROINDUSTRIAL ELACY LTDA | 94524162000334 | / | não | não | revisar |
| 29 | AGROPASTORIL E CEREAIS LTDA | 01038222000166 | / | não | não | revisar |
| 30 | AGROPECUARIA PLANALTO LTDA | 06058579000120 | Monte Castelo/ | não | não | revisar |
| 31 | AGROPECUARIA RANCHO ALEGRE LTDA | 07614359000106 | / | não | não | revisar |
| 32 | AGROPEDRINHO COMERCIO DE INSUMOS E CEREAIS LTDA | 08750816000144 | Canoinhas/ | sim | não | provável mesmo |
| 33 | AGROXISTO COMERCIO E REPRESENTACAO COMERCIAL LTDA | 07926126000211 | / | não | não | revisar |
| 35 | AGUIA PECAS E ACESSORIOS LTDA | 04695229000149 | Canoinhas/ | sim | não | provável mesmo |
| 36 | ALEX SANDRO BUENO 09506531951 | 31646273000131 | Canoinhas/ | sim | não | provável mesmo |
| 37 | AZ MARTELINHO DE OURO LTDA | 12621941000121 | Canoinhas/ | não | não | revisar |
| 47 | AMAURI SOARES 08887882908 | 28233657000118 | Canoinhas/ | não | não | revisar |
| 48 | AMBROSIO MOTORES E MAQUINAS AGRICOLAS LTDA - ME | 10652052000104 | / | não | não | revisar |
| 50 | AMOR A VIDA MEDICINA COM QUALIDADE LTDA. | 28902958000197 | Canoinhas/ | não | não | revisar |
| 51 | AMOR EXIGENTE | 29764591000155 | / | não | não | revisar |
| 54 | ANA CASSIA BRADOSKI DE LIMA 08790828950 | 29514763000132 | Canoinhas/ | sim | não | provável mesmo |
| 55 | ANDERSON RODRIGO VIDOI 03841424945 | 36700887000178 | Três Barras/ | não | não | revisar |
