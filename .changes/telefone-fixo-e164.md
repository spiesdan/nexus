---
impacto: nada_mudou
secao: corrigido
titulo: Telefone fixo com WhatsApp não derruba mais a campanha
---

A campanha de prospecção mandava para a RPC de contato o telefone só com dígitos, e a função só colocava o `+` quando o número era celular. Fixo — que também pode ter WhatsApp — era gravado sem o `+`, o banco recusava a linha (`contacts_phone_e164_format`) e a tentativa queimava a cota do dia sem mandar nada. Agora todo número com dígitos recebe o `+`; o celular continua ganhando o nono.