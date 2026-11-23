---
impacto: nada_mudou
secao: adicionado
titulo: Tabelas da cobrança SaaS preparadas (sem comportamento ainda)
---

Criamos as oito tabelas `billing_*` (cliente, assinatura, fatura, checkout,
avisos D-3/D-2/D-1, eventos do webhook, verificações pendentes e
suspensão/reativação) com RLS de leitura por organização e escrita só por
service role. Nenhuma rotina usa estas tabelas ainda: plano, valor e vencimento
continuam decisão comercial pendente. Nada muda para quem usa a instalação.
