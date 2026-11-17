---
impacto: nada_mudou
secao: corrigido
titulo: Atualizar do Mercos não morre mais esperando a tela de login
---

A coleta do Mercos às vezes desistia antes de a tela de login terminar de
renderizar: o Playwright espera 30s por padrão, o formulário não aparecia nesse
prazo, e o "Atualizar do Mercos" falhava sem ler pedido nenhum. Agora a espera
da tela de login é de 90s (ajustável em `MERCOS_LOGIN_TIMEOUT_MS`) e o resto da
coleta continua igual.
