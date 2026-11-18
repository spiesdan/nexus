---
impacto: nada_mudou
secao: corrigido
titulo: Mapa não publica mais os arquivos de desenvolvimento do MapLibre
---

O build do mapa copiava para o artefato publicado duas versões do MapLibre —
a de produção e a de desenvolvimento — porque a biblioteca escolhe o nome do
worker em tempo de execução e o empacotador não consegue provar qual vence.
Eram 3,5 MB de arquivos que nenhuma tela pede.

O build passa a remover esses arquivos depois de gerar o pacote. O mapa
continua usando a versão de produção e o worker servido pelo próprio produto.
