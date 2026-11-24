---
impacto: nada_mudou
secao: corrigido
titulo: Endereço do cliente volta a ser lido da ficha do Mercos
---

O enriquecimento da 1.68.0 abria a ficha do cliente mas só salvava o CEP: o leitor esperava campo rotulado ("Rua: ...") e a ficha real entrega o endereço em três linhas seguidas — `AVENIDA X 357 - BAIRRO`, `CEP 89580-000`, `CIDADE - Estado`. Agora ele ancora no CEP, lê o vizinho de cima e o de baixo, e converte o estado por extenso para UF. Medido na ficha real: 20 de 20 lidos com rua, número, bairro, CEP, cidade e UF.
