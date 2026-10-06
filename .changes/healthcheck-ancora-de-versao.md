---
impacto: capacidade_nova
secao: adicionado
titulo: O healthcheck confere se a versão está bem fixada
---

O diagnóstico ganhou uma seção "Âncora de versão (drift)", com cinco checagens:
a tag da imagem no `.env` (recusando canais móveis como `main`, `latest` e
`stable`), se as três imagens estão na mesma tag, se há branch local no
repositório, se há mais de um remote e se o HEAD está solto numa tag publicada.

Medido numa VPS real em 06/10/2026: o `.env` saiu de `:1.20.2` para `:main` às
22h15 e o site foi trocado sozinho às 00h48, sem ninguém pedir — `:main` é
reconstruída a cada merge, então quem aponta para ela instala o topo do
repositório sobre o banco da versão instalada. Na mesma noite o repositório
ficou com quatro branches locais (uma 239 commits atrás da remota) e dois
remotes para a mesma URL, e nada disso aparecia em lugar nenhum.
