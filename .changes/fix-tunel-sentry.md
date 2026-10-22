---
impacto: nada_mudou
secao: corrigido
titulo: Erros de tela sem sessão voltam a ser reportados
---

O relatório de erros do navegador passa por um caminho próprio do domínio
(`/monitoring`) antes de sair para o Sentry. Esse caminho estava caindo na
checagem de sessão do `proxy`, que respondia `307` para `/login` — então tudo
que quebrava ANTES do login (fachada de entrada, cadastro) era descartado em
silêncio.

Agora o caminho do túnel é público, como manda a própria documentação do Sentry
usada na configuração. Quem já instalou não precisa fazer nada: a mudança só
afeta o envio de relatório de erro, e um teste amarra o caminho do túnel à
allowlist para o defeito não voltar se a rota for renomeada.
