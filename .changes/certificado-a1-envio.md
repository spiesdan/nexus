---
impacto: nada_mudou
secao: corrigido
titulo: O certificado digital passa a ser enviado de verdade
---

Na tela de configuração fiscal havia um botão para escolher o certificado
digital. Escolhido o arquivo, o sistema anotava o nome dele e mostrava tudo como
configurado — mas o arquivo em si nunca era enviado: saía do computador de quem
configurou e não chegava ao servidor.

Na medição, a instalação tinha o nome de um certificado gravado e nenhum arquivo
de certificado em toda a máquina. Nada avisava.

Agora o arquivo é enviado e fica gravado no servidor, e a tela passa a dizer a
verdade: mostra "certificado gravado" só quando o arquivo existe, e avisa
quando não existe. O caminho do certificado também deixou de ser um campo em
que se escreve — quem define é o envio do arquivo.

O certificado é guardado em uma pasta protegida do servidor, fora do
armazenamento público, e os arquivos aceitos são verificados no servidor: um
arquivo com outro formato, mesmo que renomeado para `.pfx`, é recusado com
explicação.

Isso deixa a emissão de nota pronta para o próximo passo, que é configurar o
serviço que fala com a SEFAZ.
