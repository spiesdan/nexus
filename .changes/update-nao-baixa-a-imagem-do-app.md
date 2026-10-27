---
impacto: nada_mudou
secao: corrigido
titulo: Atualização não para mais em "No such image" numa instalação que já buildou localmente
---

A atualização para a 1.35.1 falhou numa instalação real: o banco foi atualizado,
mas o app não subiu e o sistema voltou sozinho para a versão anterior. A causa
era a política de download da imagem do app.

Quem já fez deploy construindo na própria VPS — o caminho de quem não tem
credencial do GHCR — fica com `APP_PULL_POLICY=never` no `.env`, de propósito:
sem isso, um `up -d` qualquer baixaria a imagem do registro e substituiria a
imagem construída aqui. O `update.sh` lia o `.env` no começo (e exportava esse
`never` para o ambiente), depois reescrevia o `.env` com a política correta
(`missing`) — mas o Docker Compose lê o ambiente antes do arquivo. O `pull`
então pulava a imagem do app (`Skipped`, sem motivo), e o `up -d` morria em
`No such image`. O worker e o scheduler subiam porque a política deles já era
`missing`; só o app ficava para trás.

Agora a gravação da política também exporta o valor novo, então o `pull` sempre
enxerga o que acabou de ser decidido. Quem já instalou não precisa fazer nada: a
próxima atualização passa a funcionar — e a que falhou deixou o `.env` com a
política certa, então basta rodar de novo.
