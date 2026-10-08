---
impacto: nada_mudou
secao: corrigido
titulo: O backup do banco passava a ser salvo vazio, sem avisar
---

O backup diário do banco falhava e escrevia mesmo assim um arquivo — vazio. A
pasta de backups mostrava arquivos de 20 bytes, que é um arquivo comprimido sem
nenhum conteúdo dentro, e a tela confirmava "banco: 20" como se estivesse tudo
certo.

Na medição, cinco backups seguidos estavam vazios. Nenhum deles serviria para
restaurar nada, e nada indicava o problema.

O motivo era o mesmo que já affects as consultas ao banco nesta instalação: o
nome do banco só existe dentro da rede de contêineres, e o backup subia um
contêiner temporário fora dessa rede. A conexão falhava e o erro ficava perdido
no meio do comando.

Agora o backup usa o mesmo caminho que as demais consultas — dentro do contêiner
do banco, quando o banco é um contêiner — e, antes de dar o backup por bom,
confere que o arquivo tem conteúdo. Um arquivo vazio é recusado com erro claro e
não é guardado, para não dar a impressão de que existe uma cópia.

Foi acrescentado também um aviso no capítulo de operação do manual sobre como
confirmar que o backup tem conteúdo.
