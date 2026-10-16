---
impacto: nada_mudou
secao: corrigido
titulo: Validação de produto também no runtime legado + fallback honesto
---

O gate de identidade do catálogo não alcançava o runtime legado (que atende
via `ai_agent_runs`, sem cadeia before_send): a validação agora roda antes do
envio também lá, com fallback honesto ("vou conferir") em vez de resposta
incorreta. Nada precisa ser feito na atualização.
