---
impacto: capacidade_nova
secao: corrigido
titulo: Tenant suspenso por cobrança deixa de operar as APIs do tenant
---

O gate de suspensão passou a cobrir também `/api/v1/*` no proxy e a resolver
organização ativa: tenant com assinatura vencida e `suspended_reason='billing'`
recebe 403 na API (ou é redirecionado na UI), inclusive em handlers que usam
service role sem `requireRole`. Cobrança, suporte, logout, health e auth seguem
na allowlist exata; o kill-switch devolve o acesso sem apagar o estado. A RPC
de suspensão só é chamada quando a org já está marcada como suspensa por billing
— requests saudáveis não pagam round-trip.
