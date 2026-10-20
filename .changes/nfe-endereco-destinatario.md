---
impacto: nada_mudou
secao: corrigido
titulo: NF-e exige e envia o endereço do destinatário
---

A SEFAZ recusava a NF-e com a rejeição 726 — "NF-e sem a informação de
endereço do destinatário". O emissor montava `<dest>` só com nome, documento e
`indIEDest`; o endereço existia na tela, mas não entrava no XML.

O endereço passa a sair de um único lugar: o bloco que a tela agora chama de
"Endereço do destinatário" (os mesmos campos que antes eram "Local de
entrega"). É o único bloco do contrato que já carrega os campos do `TLocal`,
inclusive o `cMun`/IBGE — o cadastro de contatos não guarda esse código. O
mesmo endereço alimenta `<dest>/<enderDest>` e `<entrega>`; quando a entrega
for diferente, o bloco continua sendo o endereço do destinatário.

Sem o endereço, o sidecar recusa antes de abrir o certificado, e a rota recusa
antes de criar a nota e o job. Antes, a nota nascia `em_emissao` e só descobria
a falta na SEFAZ, deixando uma nota condenada para cancelar.
