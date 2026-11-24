---
impacto: capacidade_nova
secao: adicionado
titulo: Sentinel agora antecipa nota que vai falhar e corrige UF quando é determinístico
---

Duas regras novas olham o pedido antes da emissão: uma roda a mesma montagem do destinatário usada pela nota e aponta pedido faturável parado por endereço incompleto; outra encontra cidade/UF que não resolve no IBGE. Quando o município existe em uma única UF, um job separado corrige a UF com auditoria antes/depois. Quando há homônimo (Irati, PR e SC), nada é tocado — a ocorrência pede decisão humana.
