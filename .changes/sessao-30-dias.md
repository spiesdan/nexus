---
impacto: nada_mudou
secao: corrigido
titulo: Fechar o app não desloga mais (cookie de sessão reescrito pelo middleware)
---

O login continuava caindo ao atualizar a página ou fechar o app no celular. O
cookie de autenticação nascia persistente, mas era **reescrito pelo middleware**
a cada navegação, com opções sem prazo — e voltava a ser cookie de sessão. O
navegador descartava ao fechar, e a pessoa caía no login outra vez.

Agora as três pontas que gravam o cookie (middleware, servidor e navegador)
carregam o mesmo prazo de **30 dias**. Quem já está logado só precisa entrar uma
última vez; a partir daí a sessão sobrevive a refresh e a fechar o app.

Quem já instalou: **não precisa fazer nada** além de entrar de novo uma vez.
