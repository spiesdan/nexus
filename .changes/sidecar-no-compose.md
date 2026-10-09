---
impacto: nada_mudou
secao: adicionado
titulo: O serviço que conversa com a SEFAZ entra no conjunto de serviços
---

O serviço que emite a nota fiscal na SEFAZ nunca foi executado nesta instalação.
Ele era mantido fora do conjunto de serviços, com a instrução de subir à mão — e
essa subida nunca aconteceu.

Agora ele é um serviço do conjunto, como os outros: sobe junto, volta sozinho
depois de reinício da máquina, e é Health-checkado. O certificado é montado
**somente para leitura**, e o serviço não tem porta exposta — ele só responde
na rede interna e exige uma senha.

O caminho do certificado também foi corrigido. O serviço exigia o caminho
completo do arquivo e o sistema mandava só o nome; o resultado seria a nota ser
recusada sem dizer que o caminho estava errado.

A emissão continua desligada por enquanto: ainda falta a Inscrição Estadual do
emitente e a troca do provedor para o emissor oficial. A tela mostra o que falta.
