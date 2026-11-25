---
impacto: nada_mudou
secao: corrigido
titulo: Aviso no Discord usa arquivo em vez de heredoc e não perde mais a mensagem
---

O workflow do aviso falhou na primeira tag que pegou (`v2.0.2`) com `Matching delimiter not found 'FIM'`: a seção do CHANGELOG não termina com quebra de linha, então o `echo "FIM"` colou na última linha do conteúdo. A mensagem agora é lida de arquivo, sem delimitador para errar, e mensagem vazia não posta nada em vez de postar vazio.
