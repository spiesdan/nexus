---
impacto: nada_mudou
secao: corrigido
titulo: Inutilização: a SEFAZ homologa (102) e a tela para de dizer que deu erro
---

A inutilização de numeração **funcionava e aparecia como erro**. O serviço da SEFAZ responde **102 — "Inutilização de número homologado"** quando aceita a faixa, mas o sidecar procurava **1002** — código que não existe nesse serviço. Resultado: o número era inutilizado de verdade e a tela mostrava **"Erro"**, com o botão "Retransmitir" convidando a reenviar o que já estava feito.

Medido em 05/11/2026, nas três primeiras inutilizações reais desta instalação (lacunas 4580–4581, 4583 e 4587 da série 1): as três voltaram **102**, ficaram como `erro` localmente, e o reenvio devolveu **563 — "Já existe pedido de Inutilização com a mesma faixa"**, que é a prova de que a homologação tinha acontecido.

Agora:

- **102** é sucesso: status `transmitida`, com o protocolo da SEFAZ.
- **563** também encerra — reenvio de faixa já homologada não é erro, e vira `transmitida` com o motivo registrado (sem protocolo novo, que a SEFAZ não devolve).
- Recusa de verdade (241, sidecar fora, timeout) continua `erro`, com o motivo.

As três linhas afetadas são reconciliadas pelo próprio botão **Retransmitir** — que, a partir desta versão, as fecha em vez de acusar falha.
