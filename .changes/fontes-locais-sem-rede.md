---
impacto: nada_mudou
secao: corrigido
titulo: Instalação não depende mais do Google para ter fonte
---

O build do produto baixava as fontes (Inter, IBM Plex Mono e as do mostruário
de design) dos servidores do Google. Numa VPS sem saída para a internet — ou
com a rede instável — o build inteiro falhava, e a instalação parava antes de
começar.

As fontes agora vêm do próprio repositório, em arquivos versionados e com o
texto da licença aberta ao lado. O build não acessa a rede para tipografia.
