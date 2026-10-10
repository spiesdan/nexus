---
impacto: nada_mudou
secao: corrigido
titulo: Importar notas da SEFAZ não exige mais provedor de emissão
---

O botão "Importar" respondia com erro em instalações que tinham certificado
válido só porque o provedor fiscal não era o de emissão. Baixar notas da SEFAZ
não é emitir: a consulta autentica pelo certificado e filtra pelo CNPJ, e
nada além disso entra na chamada.

Agora a verificação prévia pede só o que o download usa — CNPJ, certificado e
senha — e diz exatamente qual dos três falta. Quem já tinha o certificado
instalado passa a importar sem mexer em mais nada.