---
impacto: nada_mudou
secao: corrigido
titulo: O TLocal da NF-e fecha com o estado por extenso na cidade
---

O destinatário da NF-e passa a derivar a sigla do estado (SC, PR e demais) quando o cadastro escreve o estado por extenso na cidade — "Mafra, Santa Catarina", "Irati, Paraná" — e deixa o campo `uf` estruturado vazio. Antes, o município resolvia mas o TLocal ficava sem UF e a emissão recusava com "O cadastro do cliente precisa de ajuste: UF".

Com isto, pedidos seguintes com o mesmo padrão de cadastro passam a gerar a nota sem precisar completar o cadastro manualmente.
