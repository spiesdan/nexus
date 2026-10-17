---
impacto: capacidade_nova
secao: corrigido
titulo: O playbook de plataforma versãoado agora chega ao banco
---

A camada de playbook que o assistente lê na conversa (as regras de plataforma,
versionadas em `lib/agent-engine/playbooks/platform.md`) só era lida no
primeiro boot de uma instalação nova. Em instalação já existente, editar o
arquivo não mudava nada em campo — foi assim que a regra que separa vassoura
de cabo de vassoura ficou no código e não chegou a nenhum agente. É defeito de
entrega, não de conteúdo: agora existe caminho para aplicar a versão nova.

Para levar a versão nova à sua instância, com o antes/depois na tela:

    pnpm tsx scripts/atualizar-playbook-plataforma.ts
    pnpm tsx scripts/atualizar-playbook-plataforma.ts --aplicar

O primeiro comando só mostra a diferença; o segundo grava. A versão anterior
continua no histórico, então dá para voltar.
