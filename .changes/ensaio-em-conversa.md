---
impacto: nada_mudou
secao: adicionado
titulo: "Ensaio do agente vira conversa — dá para testar resposta com memória"
---

**O "Testar agente" aceitava uma mensagem só.** Cada envio era um primeiro
contato: o agente nunca lembrava do que já foi dito, e o teste mentia sobre
memória — aprovava um agente que, numa conversa real, esqueceria tudo no
segundo turno.

O painel agora é uma conversa: cada envio manda os turnos anteriores em
`historico`, e o runtime usa como passado do ensaio. A mensagem atual continua
indo em `sample_message`; o histórico mora no navegador e morre com a conversa
de teste. Nada dele é gravado no banco — o único registro por turno continua
sendo a linha de `ai_agent_runs` em dry-run, que já existia.

**O passado do ensaio só vale no ensaio.** Fora do dry-run o `override` é
ignorado: numa execução real o histórico vem da conversa, e aceitar histórico
do chamador seria deixar quem chama reescrever o passado do cliente.

**Limites honestos.** Teto de 20 turnos no schema: cada turno vira 2 mensagens
no prompt, e sem teto o ensaio de uma conversa longa estouraria a janela do
modelo sem dizer por quê. Papel inventado e turno vazio são 422 antes de tocar
no runtime.

**Mutações provadas:** papel trocado no mapeamento (`assistente` lido como
`user`) reprova 2 testes; rota sem repassar o histórico reprova 1.