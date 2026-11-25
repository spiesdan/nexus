---
impacto: nada_mudou
secao: corrigido
titulo: O prompt mestre (a lei) ganha gate em vez de depender de alguém lembrar
---

O verificador de integridade existia, mas não rodava em gate nenhum — e foi assim que o backlog passou a acusar "hash inválido" por semanas quando o prompt estava íntegro: comparava-se o `sha256sum` do arquivo cru (`c37217c4…`) com o hash do corpo normalizado (`ee40a0a2…`), que remove heading, negrito e linha vazia. Mediado: `ok: prompt íntegro — 370 linhas`. O gate novo reprova a suíte se uma palavra, um número ou a ordem das seções mudar, e tem o controle que impede o teste de passar por vacuidade (mudar uma palavra muda o hash; reformatar heading não muda). O registro **não** foi regravado: regravar para "consertar" divergência seria falsificar a lei.
