---
impacto: nada_mudou
secao: corrigido
titulo: PR que muda código sem fragmento reprova no CI, não na release
---

Três vezes em dois dias o mesmo padrão: PR com código entrou, `.changes/` ficou vazio e a **release** falhou depois do merge com "nenhum fragmento: não há versão a cortar" — cada vez custando um PR extra só de fragmento. O job `fragmento` reprova no PR, com a lista de campos do fragmento na própria mensagem. PR de release (`release/*`) e mudança só de documentação/CI não exigem; e o rótulo `sem-fragmento` existe para o caso raro, com motivo no corpo do PR.
