---
impacto: capacidade_nova
secao: adicionado
titulo: Sentinel explica o que fazer — sem executar por você
---

Cada ocorrência do Sentinel passa a carregar um plano de correção revisável:
passos, campos que ainda faltam, risco da ação, reversibilidade, fontes e a
limitação honesta do diagnóstico. O plano aparece no detalhe da ocorrência e é
gravado junto dela — o histórico mostra o que se recomendava naquele momento,
não o que a regra recomenda hoje.

Nada é executado automaticamente. Aprovar ou marcar como corrigida continua
sendo um registro da decisão humana; a correção segue manual nesta versão.

Duas evidências novas entram com a limitação declarada: divergência entre saldo
e razão de estoque (confiança baixa, porque o razão não tem saldo de abertura) e
leads duplicados no mesmo funil pela identidade que o produto já normaliza
(contato, telefone E.164 e e-mail). Nenhuma configuração nova é exigida.
