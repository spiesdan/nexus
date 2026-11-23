---
impacto: nada_mudou
secao: adicionado
titulo: O painel passa a dizer qual versão da rota o motorista aplicou
---

Duas colunas aditivas em `shipments` (`0336`) guardam `rota_versao_confirmada` e
`rota_confirmada_em`, escritas pelo aceite no aparelho com CAS na versão atual —
se o painel mudou a rota enquanto o motorista decidia, o aceite recusa 409 em vez
de confirmar uma sequência que não existe mais. O roteirizador mostra
"confirmada na versão N às …" ou "motorista ainda na versão anterior".
