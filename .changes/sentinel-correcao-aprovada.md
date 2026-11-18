---
impacto: capacidade_nova
secao: adicionado
titulo: Sentinel corrige um job de manutenção — só com sua aprovação e com reversão
---

Quando um job de manutenção (`watchdog`) fica pendente e atrasado, o Sentinel
agora mostra um plano de correção e deixa o gestor **simular** o antes/depois,
marcar que revisou e só então executar. A execução antecipa o job para agora,
registra quem aprovou e guarda o antes/depois no histórico.

A correção é deliberadamente estreita: não toca nota, saldo, pagamento,
recebível, pedido, campanha nem job de atendimento (que pode enviar mensagem ao
cliente). Se o job for reclamado pelo worker antes da reversão, o sistema
recusa em vez de fingir que desfez. Nada acontece sem aprovação humana e sem a
confirmação explícita do plano simulado.
