---
impacto: nada_mudou
secao: corrigido
titulo: Instalador volta a reconhecer as imagens publicadas e a pinar a versão
---

O `install.sh` consulta o GHCR para saber se as imagens da versão já estão
publicadas e, só então, grava no `.env` a referência fixa — em vez de deixar o
serviço num canal móvel. Essa consulta ainda perguntava pelo dono **anterior**
ao rename das imagens, então respondia "não existe" para tudo, mesmo com as seis
imagens publicadas.

O efeito era silencioso e no caminho de quem instala: a instalação caía em
`latest` (canal móvel) e nenhum serviço ficava preso à versão, contrariando a
regra de que app, worker, scheduler, sidecar fiscal, Mercos e OCR andam juntos.
Não havia erro — só um aviso dizendo que as imagens "ainda não estavam
publicadas".

O dono agora sai de `IMG_NS`, a mesma fonte única que monta as referências que o
compose usa, e o runbook de packaging deixou de ensinar o dono antigo nas
verificações manuais.
