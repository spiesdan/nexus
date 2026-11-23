---
impacto: capacidade_nova
secao: adicionado
titulo: Núcleo da cobrança SaaS do Nexus entra em modo de teste
---

O sistema já sabe impor a suspensão por assinatura vencida no **backend** (não
só na tela), com gate no `resolveActiveOrg`, no `requireRole` e no proxy `/app/*`,
allowlist exata para cobrança/suporte/saída e kill-switch que devolve o acesso
sem apagar o estado registrado. A máquina de avisos D-3/D-2/D-1 também existe,
sem reenvio retroativo e sem duplicar etapa. Chave `sk_live_` derruba o boot:
esta fatia **não cobra ninguém** — plano, preço e vencimento ainda são decisão
comercial pendente. Nenhum deploy nesta entrega.
