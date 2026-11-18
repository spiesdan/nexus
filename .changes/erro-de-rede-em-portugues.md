---
impacto: nada_mudou
secao: corrigido
titulo: A tela deixa de mostrar "Failed to fetch" — erro de rede vira frase em português
---

Estoque, compras e recebimento mostravam a mensagem crua do navegador quando a
requisição falhava por rede: **"Failed to fetch"**, em inglês, no lugar do texto
que explica o que houve. Agora erro de transporte (ou navegador offline) vira
uma frase que manda verificar a conexão e tentar de novo — mantendo na tela o
que já estava carregado.

Erro do servidor continua mostrando o texto da rota, e a validação do próprio
produto ("Adicione ao menos um item.") continua dizendo o que precisa ser dito.
