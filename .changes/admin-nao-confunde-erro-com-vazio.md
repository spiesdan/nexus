---
impacto: nada_mudou
secao: corrigido
titulo: Falha de leitura no painel de plataforma deixa de parecer "nenhum registro"
---

Tenants, auditoria, incidentes, LGPD e usuários renderizavam a tabela vazia
quando a consulta falhava. No painel de plataforma, "nenhum tenant" pode ser
lido como perda de dados.

As cinco listas passaram a distinguir erro de vazio: erro mostra o motivo com
"Tentar novamente", e o vazio real continua sendo o da tabela.
