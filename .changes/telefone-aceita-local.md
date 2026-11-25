---
impacto: nada_mudou
secao: corrigido
titulo: Telefone aceita 47996751010 — o E.164 é do sistema, não do operador
---

O schema exigia `+5511999998888` cru e recusava `47996751010` e `(47) 99675-1010` — que é como todo mundo digita (reclamado em 25/11/2026: "quero apenas poder colocar 47996751010"). O E.164 é necessidade do canal (o WhatsApp casa por ele), não da pessoa. Agora a entrada normaliza: 10 ou 11 dígitos, com ou sem máscara, com ou sem +55; o nono dígito é canonicalizado e o banco continua guardando E.164. O rótulo "Telefone (E.164)" virou "Telefone" e o placeholder mostra o formato do dia a dia.
