---
impacto: nada_mudou
secao: corrigido
titulo: Inbox deixa de travar quando a conexão de tempo real cai
---

Em algumas situações o inbox inteiro ficava lento e o envio respondia "algo deu
errado": a conexão de tempo real caía, tentava voltar a cada segundo e, a cada
tentativa, mandava a tela buscar tudo de novo. Com a aba aberta por muito tempo,
isso sozinho ocupava o servidor.

A reconexão agora usa um canal novo a cada tentativa e espera o anterior ser
encerrado, então ou volta de verdade ou espera mais — sem repetir em rajada. As
notas internas também passaram a avisar a tela em tempo real, e não só no F5.
